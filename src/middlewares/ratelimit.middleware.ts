import { Request, Response } from "express";
import rateLimit from "express-rate-limit";

/**
 * Auth rate limiter — TRD: 10 requests per minute on /auth/* endpoints
 *
 * Tracks by IP address. Works correctly behind proxies because
 * app.set('trust proxy', 1) is set in app.config.ts — this makes
 * req.ip return the real user IP from X-Forwarded-For header,
 * not the proxy's IP.
 */
export const authRateLimiter = rateLimit({
  windowMs: 60 * 1000,       // 1 minute window
  max: 10,                    // max 10 requests per window per IP
  standardHeaders: "draft-7", // sends RateLimit headers in response
  legacyHeaders: false,       // disables old X-RateLimit-* headers

  // Returns our standard error format — consistent with all other errors
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      status: "error",
      message: "Too many requests, please try again later",
    });
  },
});

/**
 * API rate limiter — TRD: 60 requests per minute on all other endpoints
 *
 * Tracks by authenticated user ID when available (more accurate than IP
 * because multiple users can share an IP e.g. office networks).
 * Falls back to IP for unauthenticated requests.
 */
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,       // 1 minute window
  max: 60,                    // max 60 requests per window per user
  standardHeaders: "draft-7",
  legacyHeaders: false,

  // Use userId when authenticated, IP as fallback
  keyGenerator: (req: Request) => req.user?.userId ?? req.ip ?? "unknown",

  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      status: "error",
      message: "Too many requests, please try again later",
    });
  },
});