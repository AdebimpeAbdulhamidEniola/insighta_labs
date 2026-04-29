import { Request, Response, NextFunction } from "express";
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
} from "../utils/pkce.utils.js";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../utils/jwt.utils.js";
import {
  buildAuthorizationUrl,
  exchangeCodeForToken,
  fetchGitHubUser,
  fetchGitHubEmail,
} from "../services/github.services";
import { sendError } from "../utils/response.utils";
import {
  upsertGitHubUser,
  findUserById,
  setRefreshToken,
} from "../model/auth.model";

// Web flow only — CLI holds its own codeVerifier locally
const pkceStore = new Map<string, { codeVerifier: string; expiresAt: number }>();

// ── Shared helpers ────────────────────────────────────────────────────────────

const resolveUser = async (githubAccessToken: string, res: Response) => {
  const githubUser = await fetchGitHubUser(githubAccessToken);
  if (!githubUser) {
    sendError(res, 502, "Failed to fetch GitHub user");
    return null;
  }

  // GitHub hides email if user set it to private — fall back to /user/emails
  const email = githubUser.email ?? (await fetchGitHubEmail(githubAccessToken));
  if (!email) {
    sendError(res, 400, "Email is required but not available");
    return null;
  }

  const user = await upsertGitHubUser({
    githubId: String(githubUser.id),
    username: githubUser.login,
    email,
    avatarUrl: githubUser.avatar_url,
  });

  if (!user.is_active) {
    sendError(res, 403, "Account is deactivated");
    return null;
  }

  return user;
};

// ── Web OAuth flow ────────────────────────────────────────────────────────────

export const initiateGitHubAuth = (req: Request, res: Response): void => {
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  pkceStore.set(state, {
    codeVerifier,
    expiresAt: Date.now() + 10 * 60 * 1000,
  });

  res.redirect(buildAuthorizationUrl(state, codeChallenge));
};

/**
 * Web callback — GitHub redirects here after the user approves.
 *
 * Tokens are delivered via HTTP-only cookies so JavaScript in the web portal
 * cannot read them (TRD requirement). After setting the cookies the browser
 * is redirected to the web portal dashboard, completing the login seamlessly.
 */
export const handleGitHubCallback = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { code, state, error } = req.query;

    if (error || !code || !state) {
      sendError(res, 400, "Authorization denied or missing parameters");
      return;
    }

    const pkceData = pkceStore.get(state as string);
    if (!pkceData || pkceData.expiresAt < Date.now()) {
      pkceStore.delete(state as string);
      sendError(res, 400, "Invalid or expired state");
      return;
    }

    // Delete before exchanging — state is single-use
    pkceStore.delete(state as string);

    const tokenData = await exchangeCodeForToken(
      code as string,
      pkceData.codeVerifier
    );
    if (!tokenData) {
      sendError(res, 502, "Token exchange failed");
      return;
    }

    const user = await resolveUser(tokenData.access_token, res);
    if (!user) return;

    const accessToken = generateAccessToken(user.id, user.role);
    const refreshToken = generateRefreshToken(user.id);
    await setRefreshToken(user.id, refreshToken);

    const isProduction = process.env.NODE_ENV === "production";

    // Set access token as HTTP-only cookie — JS cannot read this
    res.cookie("access_token", accessToken, {
      httpOnly: true,
      secure: isProduction,   // HTTPS only in production
      sameSite: "lax",        // Protects against CSRF for cross-site navigations
      maxAge: 3 * 60 * 1000, // 3 minutes — matches access token expiry
    });

    // Set refresh token as HTTP-only cookie — JS cannot read this
    res.cookie("refresh_token", refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: 5 * 60 * 1000, // 5 minutes — matches refresh token expiry
    });

    // Redirect the browser to the web portal dashboard
    // The portal is now authenticated via the cookies just set above
    const portalUrl = process.env.WEB_PORTAL_URL || "http://localhost:3001";
    res.redirect(`${portalUrl}/dashboard`);
  } catch (error) {
    next(error);
  }
};

// ── CLI OAuth flow ────────────────────────────────────────────────────────────

/**
 * CLI callback — the CLI's local server captures the GitHub code, then POSTs
 * it here along with the code_verifier it generated.
 *
 * Tokens are returned in the JSON body so the CLI can store them locally
 * and attach them as Authorization: Bearer headers on future requests.
 */
export const handleCLICallback = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { code, code_verifier, redirect_uri } = req.body;

    if (!code || !code_verifier) {
      sendError(res, 400, "code and code_verifier are required");
      return;
    }

    const tokenData = await exchangeCodeForToken(code, code_verifier, redirect_uri);
    if (!tokenData || (tokenData as any).error) {
      sendError(
        res,
        502,
        `Token exchange failed: ${(tokenData as any)?.error || "Unknown error"}`
      );
      return;
    }

    const user = await resolveUser(tokenData.access_token, res);
    if (!user) return;

    const accessToken = generateAccessToken(user.id, user.role);
    const refreshToken = generateRefreshToken(user.id);
    await setRefreshToken(user.id, refreshToken);

    // CLI receives tokens in JSON — it stores them locally (e.g. ~/.insighta/tokens.json)
    res.status(200).json({
      status: "success",
      access_token: accessToken,
      refresh_token: refreshToken,
    });
  } catch (error) {
    next(error);
  }
};

// ── Token refresh ─────────────────────────────────────────────────────────────

export const refreshAccessToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Accept refresh token from either JSON body (CLI) or cookie (web portal)
    const refresh_token = req.body.refresh_token || req.cookies?.refresh_token;

    if (!refresh_token) {
      sendError(res, 400, "refresh_token is required");
      return;
    }

    const decoded = verifyRefreshToken(refresh_token);
    if (!decoded) {
      sendError(res, 401, "Invalid or expired refresh token");
      return;
    }

    const user = await findUserById(decoded.userId);

    // DB comparison catches replayed tokens — old tokens are overwritten on rotation
    if (!user || user.refresh_token !== refresh_token) {
      sendError(res, 401, "Invalid or expired refresh token");
      return;
    }

    if (!user.is_active) {
      sendError(res, 403, "Account is deactivated");
      return;
    }

    const newAccessToken = generateAccessToken(user.id, user.role);
    const newRefreshToken = generateRefreshToken(user.id);
    await setRefreshToken(user.id, newRefreshToken);

    const isProduction = process.env.NODE_ENV === "production";

    // If the request came from the web portal (cookie present), refresh via cookies
    if (req.cookies?.refresh_token) {
      res.cookie("access_token", newAccessToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: "lax",
        maxAge: 3 * 60 * 1000,
      });
      res.cookie("refresh_token", newRefreshToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: "lax",
        maxAge: 5 * 60 * 1000,
      });
      res.status(200).json({ status: "success", message: "Tokens refreshed" });
      return;
    }

    // CLI gets new tokens in JSON body
    res.status(200).json({
      status: "success",
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
    });
  } catch (error) {
    next(error);
  }
};

// ── Whoami ────────────────────────────────────────────────────────────────────

export const getMe = async (req: Request, res: Response): Promise<void> => {
  const user = await findUserById(req.user!.userId);
  if (!user) {
    sendError(res, 404, "User not found");
    return;
  }
  res.status(200).json({
    status: "success",
    data: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      avatar_url: user.avatar_url,
      is_active: user.is_active,
      created_at: user.created_at,
    },
  });
};

// ── Logout ────────────────────────────────────────────────────────────────────

export const logout = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    await setRefreshToken(req.user!.userId, null);

    // Clear both cookies so the web portal session is fully terminated
    res.clearCookie("access_token");
    res.clearCookie("refresh_token");

    res.status(200).json({
      status: "success",
      message: "Logged out successfully",
    });
  } catch (error) {
    next(error);
  }
};