import cors from "cors";
import express, { Application } from "express";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import morgan from "morgan";
import { notFoundHandler } from "../utils/notfound.utils";
import { errorHandler } from "../utils/errorhandler.utils";
import ProfileRouter from "../routes/profile.route";
import AuthRouter from "../routes/auth.route";
import UsersRouter from "../routes/user.routes";

dotenv.config();

export const createApp = (): Application => {
  const app: Application = express();

  app.disable("x-powered-by"); // Hide Express header for security


  app.set("trust proxy", 1); // Trust first proxy (important for correct client IP in rate limiting)
  app.use(express.json());

  // cookie-parser must come BEFORE routes so req.cookies is populated
  // when the auth middleware reads the access_token cookie from web portal requests
  app.use(cookieParser());

  // Log every request including in production
  app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

  // credentials: true is required so the browser sends HTTP-only cookies
  // cross-origin (web portal origin → backend origin).
  // The origin must be explicit (not "*") when credentials are involved.

  app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3001",
    credentials: true,
    // Tell the browser these custom headers are allowed cross-origin
    // Without this, the preflight OPTIONS request blocks X-API-Version
    // and the actual API request is never sent
    allowedHeaders: ["Content-Type", "Authorization", "X-API-Version"],
    exposedHeaders: ["RateLimit-Limit", "RateLimit-Remaining", "RateLimit-Reset"],
  })
);

  // Routes — auth stays at /auth as specified in the TRD
  app.use("/auth", AuthRouter);
  app.use("/api/profiles", ProfileRouter);
  app.use("/api/users", UsersRouter);


  // Not Found Handler
  app.use(notFoundHandler);

  // Error Handler
  app.use(errorHandler);

  return app;
};