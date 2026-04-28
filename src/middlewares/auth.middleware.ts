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
export const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    sendError(res, 401, "Authentication required");
    return;
  }

  const token = authHeader.substring(7);

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

