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

const issueTokens = async (userId: string, role: string, res: Response) => {
  const accessToken = generateAccessToken(userId, role);
  const refreshToken = generateRefreshToken(userId);
  await setRefreshToken(userId, refreshToken);

  res.status(200).json({
    status: "success",
    access_token: accessToken,
    refresh_token: refreshToken,
  });
};

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

    await issueTokens(user.id, user.role, res);
  } catch (error) {
    next(error);
  }
};
// src/controllers/auth.controller.ts

export const handleCLICallback = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { code, code_verifier, redirect_uri } = req.body;  // ← ADD redirect_uri

    if (!code || !code_verifier) {
      sendError(res, 400, "code and code_verifier are required");
      return;
    }

    const tokenData = await exchangeCodeForToken(code, code_verifier, redirect_uri);
    if (!tokenData || (tokenData as any).error) {
      sendError(res, 502, `Token exchange failed: ${(tokenData as any)?.error || 'Unknown error'}`);
      return;
    }

    const user = await resolveUser(tokenData.access_token, res);
    if (!user) return;

    await issueTokens(user.id, user.role, res);
  } catch (error) {
    next(error);
  }
};
export const refreshAccessToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { refresh_token } = req.body;

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

    await issueTokens(user.id, user.role, res);
  } catch (error) {
    next(error);
  }
};


//the cli endpoint for whoami
export const getMe = async (req: Request, res: Response): Promise<void> => {
  const user = await findUserById(req.user!.userId);
  if (!user) { sendError(res, 404, "User not found"); return; }
  res.status(200).json({
    status: "success",
    ...user, // username, email, role, is_active, created_at, avatar_url
  });
};

export const logout = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // req.user is set by authenticate middleware
    await setRefreshToken(req.user!.userId, null);

    res.status(200).json({
      status: "success",
      message: "Logged out successfully",
    });
  } catch (error) {
    next(error);
  }
};
