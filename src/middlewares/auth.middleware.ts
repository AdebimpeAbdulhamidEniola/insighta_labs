import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/jwt.utils.js";
import { sendError } from "../utils/response.utils.js";
import { findUserById } from "../model/auth.model.js";

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: { userId: string; role: string };
    }
  }
}

// Require authentication
// Supports two token sources to cover both interfaces defined in the TRD:
//   1. Authorization: Bearer <token>  → used by CLI and direct API calls
//   2. access_token cookie            → used by the web portal (HTTP-only, JS cannot read it)
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  let token: string | undefined;

  // Source 1 — Bearer header (CLI / API)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.substring(7);
  }

  // Source 2 — HTTP-only cookie (web portal)
  // Only fall back to cookie if no Bearer header was present
  if (!token && req.cookies?.access_token) {
    token = req.cookies.access_token;
  }

  if (!token) {
    sendError(res, 401, "Authentication required");
    return;
  }

  const decoded = verifyAccessToken(token);
  if (!decoded) {
    sendError(res, 401, "Invalid or expired token");
    return;
  }

  // Check if user is still active in the database
  const user = await findUserById(decoded.userId);
  if (!user || !user.is_active) {
    sendError(res, 403, "User account is deactivated");
    return;
  }

  req.user = decoded;
  next();
};

// Require specific roles
export const requireRole = (...allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      sendError(res, 403, "Insufficient permissions");
      return;
    }

    next();
  };
};