import { Request, Response, NextFunction } from 'express';
import { verifyToken, TokenPayload } from '../utils/security.js';
import { queryOne } from '../database/db.js';
import { AppError } from './errorHandler.js';

export interface AuthenticatedUser extends TokenPayload {
  id: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      workstationId?: string;
    }
  }
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Authentication token missing or invalid format', 401, 'AUTH_REQUIRED');
    }

    const token = authHeader.split(' ')[1];
    let decoded: TokenPayload;
    try {
      decoded = verifyToken(token);
    } catch {
      throw new AppError('Session token has expired or is invalid. Please log in again.', 401, 'TOKEN_EXPIRED');
    }

    // Check if user still exists and is active in database
    const user = await queryOne(
      'SELECT id, username, email, full_name, role, is_active, token_version FROM users WHERE id = ?',
      [decoded.userId]
    );

    if (!user) {
      throw new AppError('User account not found', 401, 'USER_NOT_FOUND');
    }

    if (user.is_active !== 1) {
      throw new AppError('This user account has been deactivated. Please contact the administrator.', 403, 'ACCOUNT_DEACTIVATED');
    }

    // Session revocation check: if token version does not match, reject
    if (decoded.tokenVersion !== undefined && user.token_version !== undefined && Number(user.token_version) !== Number(decoded.tokenVersion)) {
      throw new AppError('Session has been revoked or expired due to a credential or security update. Please log in again.', 401, 'SESSION_REVOKED');
    }

    // Extract workstation header if provided
    const clientWorkstation = (req.headers['x-workstation-id'] as string) || decoded.workstationId || 'WS-DEFAULT';

    req.user = {
      id: user.id,
      userId: user.id,
      username: user.username,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      workstationId: clientWorkstation,
    };
    req.workstationId = clientWorkstation;

    next();
  } catch (error) {
    next(error);
  }
}
