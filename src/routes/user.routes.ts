import { Router } from "express";
import { getMe } from "../controllers/auth.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { apiRateLimiter } from "../middlewares/ratelimit.middleware.js";

const router = Router();

// All /api/users/* routes require authentication and rate limiting
router.use(authenticate);
router.use(apiRateLimiter);

/**
 * GET /api/users/me
 *
 * Returns the currently authenticated user's profile.
 * Used by:
 *  - CLI: insighta whoami command
 *  - Web portal: account page
 *
 * No API version header required here — versioning applies
 * only to profile-related endpoints per the TRD.
 */
router.get("/me", getMe);

export default router;