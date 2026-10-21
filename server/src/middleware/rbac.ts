import { Request, Response, NextFunction } from 'express';
import { queryOne } from '../database/db.js';
import { AppError } from './errorHandler.js';

/**
 * Enforce role requirement (e.g. requireRole('admin', 'fee_manager'))
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401, 'AUTH_REQUIRED'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new AppError(
          `Access denied. Role '${req.user.role}' is not authorized to perform this operation. Required: [${allowedRoles.join(', ')}]`,
          403,
          'PERMISSION_DENIED'
        )
      );
    }

    next();
  };
}

/**
 * Enforce granular permission code (e.g. requirePermission('challan:generate'))
 */
export function requirePermission(permissionCode: string) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return next(new AppError('Authentication required', 401, 'AUTH_REQUIRED'));
      }

      // Administrators have all permissions implicitly
      if (req.user.role === 'admin') {
        return next();
      }

      const match = await queryOne(
        `SELECT 1 FROM role_permissions WHERE role = ? AND permission_code = ?`,
        [req.user.role, permissionCode]
      );

      if (!match) {
        return next(
          new AppError(
            `Access denied. Your role '${req.user.role}' lacks permission '${permissionCode}'.`,
            403,
            'PERMISSION_DENIED'
          )
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
