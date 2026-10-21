import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

import crypto from 'crypto';

export class AppError extends Error {
  public statusCode: number;
  public errorCode: string;
  public details?: any;

  constructor(message: string, statusCode = 400, errorCode = 'BAD_REQUEST', details?: any) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  const correlationId = (req.headers['x-correlation-id'] as string) || `err_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

  // 1. Zod Validation Errors
  if (err instanceof ZodError) {
    return res.status(422).json({
      success: false,
      errorCode: 'VALIDATION_ERROR',
      message: 'Invalid input parameters provided',
      correlation_id: correlationId,
      errors: err.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });
  }

  // 2. Custom App Operational Errors
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      errorCode: err.errorCode,
      message: err.message,
      correlation_id: correlationId,
      details: err.details,
    });
  }

  // 3. SQLite / LibSQL Constraint Violations
  if (err.message && (err.message.includes('UNIQUE constraint failed') || err.message.includes('SQLITE_CONSTRAINT_UNIQUE'))) {
    return res.status(409).json({
      success: false,
      errorCode: 'DUPLICATE_RECORD',
      message: 'A record with the specified unique field already exists (e.g. Roll Number, Challan Number, or Receipt Number).',
      correlation_id: correlationId,
    });
  }

  // 4. Default / Unexpected Server Errors
  console.error(`[Correlation: ${correlationId}] Unhandled Server Error:`, err);
  return res.status(500).json({
    success: false,
    errorCode: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected internal error occurred. Please contact the system administrator.',
    correlation_id: correlationId,
  });
}
