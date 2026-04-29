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

// Reusable cookie options builder
const cookieOptions = (maxAgeMs: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: maxAgeMs,
});

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
 * Sets HTTP-only cookies and redirects browser to the frontend dashboard.
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

    res.cookie("access_token", accessToken, cookieOptions(3 * 60 * 1000));
    res.cookie("refresh_token", refreshToken, cookieOptions(5 * 60 * 1000));

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3001";
    res.redirect(`${frontendUrl}/dashboard`);
  } catch (error) {
    next(error);
  }
};

// ── CLI OAuth flow ────────────────────────────────────────────────────────────

/**
 * CLI callback — the CLI's local server captures the GitHub code, then POSTs
 * it here along with the code_verifier it generated.
 *
 * FIX: We now return user info (username, role etc.) alongside the tokens.
 *
 * WHY THIS WAS BROKEN:
 * The old response only returned access_token and refresh_token.
 * The CLI tried to display "Logged in as [username]" but username was
 * never in the response — so it showed "unknown" as a fallback.
 *
 * Now the CLI gets everything it needs in a single response:
 *  - tokens to store locally for future requests
 *  - user info to display the success message immediately
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

    // Return tokens AND user info so CLI can display "Logged in as username"
    // without needing to make a second request to /auth/me
    res.status(200).json({
      status: "success",
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        username: user.username,   // ← CLI uses this to display login success
        email: user.email,
        role: user.role,
        avatar_url: user.avatar_url,
      },
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

    // Web portal path — refresh via cookies
    if (req.cookies?.refresh_token) {
      res.cookie("access_token", newAccessToken, cookieOptions(3 * 60 * 1000));
      res.cookie("refresh_token", newRefreshToken, cookieOptions(5 * 60 * 1000));
      res.status(200).json({
        status: "success",
        access_token: newAccessToken,
        refresh_token: newRefreshToken,
      });
      return;
    }

    // CLI path — return new pair in JSON
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

/**
 * GET /api/users/me  (also available at GET /auth/me for CLI)
 * Only returns safe fields — refresh_token must NEVER leave the server.
 */
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