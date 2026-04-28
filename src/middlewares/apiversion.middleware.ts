import { Request, Response, NextFunction } from "express";
import { sendError } from "../utils/response.utils";

export const requireApiVersion = (req: Request, res: Response, next: NextFunction) => {
  if (req.headers["x-api-version"] !== "1") {
    sendError(res, 400, "API version header required");
    return;
  }
  next();
};