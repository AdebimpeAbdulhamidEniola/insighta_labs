import { Request } from "express";
import rateLimit from "express-rate-limit";

export const authRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { status: "error", message: "Too many requests" },
});

export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { status: "error", message: "Too many requests" },
  keyGenerator: (req: Request) => req.user?.userId ?? req.ip ?? "unknown",
});