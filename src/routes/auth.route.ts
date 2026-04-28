import { Router } from "express";
import {
  initiateGitHubAuth,
  handleGitHubCallback,
  handleCLICallback,
  refreshAccessToken,
  logout,getMe
} from "../controllers/auth.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { authRateLimiter } from "../middlewares/ratelimit.middleware";

const router = Router();

// Rate limit applies to every auth route
router.use(authRateLimiter);

router.get("/github", initiateGitHubAuth);
router.get("/github/callback", handleGitHubCallback);
router.post("/cli/callback", handleCLICallback);
router.post("/refresh", refreshAccessToken);
router.get("/me", authenticate, getMe);

// logout requires a valid access token — you must be logged in to log out
router.post("/logout", authenticate, logout);

export default router;