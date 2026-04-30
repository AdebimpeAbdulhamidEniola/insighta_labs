import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/jwt.utils.js";
import { sendError } from "../utils/response.utils.js";
import { findUserById } from "../model/auth.model.js";



export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  let token: string | undefined;

  // Source 1 — Bearer header (CLI)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.substring(7);
  }

  // Source 2 — HTTP-only cookie (web portal)
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

  const user = await findUserById(decoded.userId);
  if (!user || !user.is_active) {
    sendError(res, 403, "User account is deactivated");
    return;
  }

  req.user = decoded;
  next();
};

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