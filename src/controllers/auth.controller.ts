import { Request, Response, NextFunction } from "express";
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
} from "../utils/pkce.utils";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../utils/jwt.utils";
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


const cookieOptions = (maxAgeMs: number) => {
  const isProduction = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,                                    // JS cannot read this cookie
    secure: isProduction,                              // HTTPS only when deployed
    sameSite: (isProduction ? "none" : "lax") as "none" | "lax",
    maxAge: maxAgeMs,
  };
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


export const handleGitHubCallback = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { code, state, error } = req.query;

    if (error || !code) {
      sendError(res, 400, "Authorization denied or missing parameters");
      return;
    }

    // Web flow: validate state from pkceStore
    if (!state || typeof state !== "string") {
      sendError(res, 400, "Missing state parameter");
      return;
    }

    const stored = pkceStore.get(state);
    if (!stored) {
      sendError(res, 400, "Invalid or expired state");
      return;
    }

    if (Date.now() > stored.expiresAt) {
      pkceStore.delete(state);
      sendError(res, 400, "State expired — please try again");
      return;
    }

    pkceStore.delete(state);

    const tokenData = await exchangeCodeForToken(
      code as string,
      stored.codeVerifier
    );

    if (!tokenData || "error" in tokenData) {
      sendError(res, 502, "Token exchange failed");
      return;
    }

    const user = await resolveUser(tokenData.access_token, res);
    if (!user) return;

    const accessToken = generateAccessToken(user.id, user.role);
    const refreshToken = generateRefreshToken(user.id);
    await setRefreshToken(user.id, refreshToken);

    res
      .cookie("access_token", accessToken, cookieOptions(3 * 60 * 1000))
      .cookie("refresh_token", refreshToken, cookieOptions(5 * 60 * 1000))
      .redirect(`${process.env.FRONTEND_URL}/callback`);
  } catch (err) {
    next(err);
  }
};

export const handleCLICallback = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { code, code_verifier, redirect_uri } = req.body;

    if (!code || !code_verifier || !redirect_uri) {
      sendError(res, 400, "Missing code, code_verifier, or redirect_uri");
      return;
    }

    const tokenData = await exchangeCodeForToken(code, code_verifier, redirect_uri);
    if (!tokenData || "error" in tokenData) {
      sendError(res, 502, "Token exchange failed");
      return;
    }

    const user = await resolveUser(tokenData.access_token, res);
    if (!user) return;

    const accessToken = generateAccessToken(user.id, user.role);
    const refreshToken = generateRefreshToken(user.id);
    await setRefreshToken(user.id, refreshToken);

    res.status(200).json({
      status: "success",
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        avatar_url: user.avatar_url,
        github_id: user.github_id,
      },
    });
  } catch (err) {
    next(err);
  }
};
export const refreshAccessToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token =
      req.cookies?.refresh_token ?? req.body?.refresh_token ?? null;

    if (!token) {
      sendError(res, 401, "No refresh token provided");
      return;
    }

    const payload = verifyRefreshToken(token);
    if (!payload) {
      sendError(res, 401, "Invalid or expired refresh token");
      return;
    }

    const user = await findUserById(payload.userId);
    if (!user || !user.is_active) {
      sendError(res, 401, "User not found or deactivated");
      return;
    }

    if (user.refresh_token !== token) {
      sendError(res, 401, "Refresh token reuse detected");
      return;
    }

    const newAccessToken = generateAccessToken(user.id, user.role);
    const newRefreshToken = generateRefreshToken(user.id);
    await setRefreshToken(user.id, newRefreshToken);

    res.status(200).json({
      status: "success",
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
    });
  } catch (err) {
    next(err);
  }
};

export const logout = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (userId) {
      await setRefreshToken(userId, null);
    }

    res
      .clearCookie("access_token")
      .clearCookie("refresh_token")
      .status(200)
      .json({ status: "success", message: "Logged out" });
  } catch (err) {
    next(err);
  }
};

export const getMe = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.userId as string;
    const user = await findUserById(userId);

    if (!user || !user.is_active) {
      sendError(res, 401, "User not found or deactivated");
      return;
    }

    res.status(200).json({
      status: "success",
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        avatar_url: user.avatar_url,
        github_id: user.github_id,
      },
    });
  } catch (err) {
    next(err);
  }
};