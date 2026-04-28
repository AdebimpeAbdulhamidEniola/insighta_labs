// src/utils/errorhandler.utils.ts
import { Request, Response, NextFunction } from "express";
import { sendError } from "./response.utils.js";
import { AppError } from "./apperror.utils.js";

export const errorHandler = (err: unknown, req: Request, res: Response, next: NextFunction): void => {

  //specifically for those API calls error
  if (err instanceof AppError) {
    return sendError(res, err.statusCode, err.message);
  }

  //other general error
  sendError(res, 500, "Internal server error");
};