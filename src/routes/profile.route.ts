import { Router } from "express";
import {
  getAllProfiles,
  searchProfiles,
  getProfileById,
  createUserProfile,
  exportProfiles,
  deleteUserProfile
} from "../controllers/profile.controller.js";
import { authenticate, requireRole } from "../middlewares/auth.middleware.js";
import { apiRateLimiter } from "../middlewares/ratelimit.middleware.js";
import { requireApiVersion } from "../middlewares/apiversion.middleware.js";

const router = Router();

// All profile routes require authentication, rate limiting, and API version header
router.use(authenticate);
router.use(apiRateLimiter);
router.use(requireApiVersion);

router.get("/", getAllProfiles);
router.get("/search", searchProfiles);
router.get("/export", exportProfiles);
router.get("/:id", getProfileById);
router.post("/", requireRole("admin"), createUserProfile);
router.delete("/:id", requireRole("admin"), deleteUserProfile);

export default router;