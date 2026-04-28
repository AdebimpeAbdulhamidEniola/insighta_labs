// src/utils/notfound.utils.ts
import { Request, Response } from "express";
import { sendError } from "./response.utils";

export const notFoundHandler = (req: Request, res: Response): void => {
  sendError(res, 404, `Route ${req.originalUrl} not found`);
};