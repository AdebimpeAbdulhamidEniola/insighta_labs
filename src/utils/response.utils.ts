// src/utils/response.utils.ts
import { Response } from 'express';

export const sendSuccess = (res: Response, statusCode:number, data: object): void => {
  res.status(statusCode).json({
    status: 'success',
    data,
  });
};

export const sendError = (res: Response, statusCode: number, message: string): void => {
  res.status(statusCode).json({
    status: 'error',
    message,
  });
};