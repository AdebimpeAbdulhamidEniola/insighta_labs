import { Router } from "express";           
import { uploadCSV } from "../controllers/ingestion.controller";
import { authenticate, requireRole } from "../middlewares/auth.middleware";
import { apiRateLimiter } from "../middlewares/ratelimit.middleware";
import { requireApiVersion } from "../middlewares/apiversion.middleware";
import { upload } from "../middlewares/upload.middleware";

const router = Router();

// All ingestion routes require authentication, admin role, rate limiting, and API version header
router.use(requireApiVersion);
router.use(authenticate);
router.use(apiRateLimiter);

// Only admins can bulk upload
router.post("/", requireRole("admin"), upload.single("file"), uploadCSV);

export default router;