import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { queryOne, queryAll, getDb } from '../database/db.js';
import { verifyPassword, hashPassword, signToken, sanitizeUser } from '../utils/security.js';
import { authenticate } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { logAuditEvent } from '../middleware/audit.js';

export const authRouter = Router();

const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
  workstationId: z.string().optional().default('WS-DEFAULT'),
});

// POST /api/auth/login
authRouter.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { username, password, workstationId } = loginSchema.parse(req.body);
    const ip = req.ip || req.socket.remoteAddress;

    const user = await queryOne(
      'SELECT id, username, email, full_name, password_hash, role, is_active, token_version, failed_login_attempts, locked_until FROM users WHERE username = ?',
      [username]
    );

    if (!user) {
      // Audit failed attempt
      await logAuditEvent({
        eventType: 'AUTH_FAILED',
        actorName: username,
        role: 'unknown',
        workstationId,
        targetTable: 'users',
        targetId: username,
        action: 'LOGIN_ATTEMPT',
        reason: 'User not found',
        ipAddress: ip,
      });
      throw new AppError('Invalid username or password', 401, 'INVALID_CREDENTIALS');
    }

    if (user.is_active !== 1) {
      throw new AppError('This account is deactivated. Contact administrator.', 403, 'ACCOUNT_DEACTIVATED');
    }

    // Check account temporary lockout
    if (user.locked_until) {
      const lockExpiry = new Date(user.locked_until).getTime();
      if (lockExpiry > Date.now()) {
        const remainingMinutes = Math.max(1, Math.ceil((lockExpiry - Date.now()) / (60 * 1000)));
        throw new AppError(
          `This account has been temporarily locked due to multiple failed login attempts. Please try again after ${remainingMinutes} minute(s) or contact the administrator.`,
          423,
          'ACCOUNT_LOCKED'
        );
      }
    }

    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      const db = getDb();
      const currentFailed = Number(user.failed_login_attempts || 0) + 1;
      let newLockedUntil: string | null = null;
      if (currentFailed >= 5) {
        newLockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      }

      await db.execute({
        sql: 'UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?',
        args: [currentFailed, newLockedUntil, user.id],
      });

      await logAuditEvent({
        eventType: currentFailed >= 5 ? 'ACCOUNT_LOCKED' : 'AUTH_FAILED',
        actorId: user.id,
        actorName: user.username,
        role: user.role,
        workstationId,
        targetTable: 'users',
        targetId: user.id,
        action: 'LOGIN_ATTEMPT',
        reason: currentFailed >= 5 ? 'Account locked after 5 failed attempts' : 'Incorrect password',
        ipAddress: ip,
      });

      if (currentFailed >= 5) {
        throw new AppError(
          'Account has been temporarily locked for 15 minutes due to 5 consecutive failed login attempts. Contact an administrator for assistance.',
          423,
          'ACCOUNT_LOCKED'
        );
      }
      throw new AppError('Invalid username or password', 401, 'INVALID_CREDENTIALS');
    }

    // Reset failed login attempts and update last_login_at
    const db = getDb();
    await db.execute({
      sql: 'UPDATE users SET last_login_at = CURRENT_TIMESTAMP, failed_login_attempts = 0, locked_until = NULL WHERE id = ?',
      args: [user.id],
    });

    const token = signToken({
      userId: user.id,
      username: user.username,
      role: user.role,
      fullName: user.full_name,
      workstationId,
      tokenVersion: Number(user.token_version || 1),
    });

    // Fetch user's permissions
    const permissions = await queryAll(
      `SELECT permission_code FROM role_permissions WHERE role = ?`,
      [user.role]
    );

    await logAuditEvent({
      eventType: 'AUTH_SUCCESS',
      actorId: user.id,
      actorName: user.username,
      role: user.role,
      workstationId,
      targetTable: 'users',
      targetId: user.id,
      action: 'LOGIN',
      ipAddress: ip,
    });

    res.json({
      success: true,
      token,
      user: {
        ...sanitizeUser(user),
        permissions: permissions.map((p) => p.permission_code),
        workstationId,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/auth/me
authRouter.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await queryOne(
      'SELECT id, username, email, full_name, role, is_active, last_login_at FROM users WHERE id = ?',
      [req.user!.id]
    );

    if (!user) {
      throw new AppError('User not found', 404, 'NOT_FOUND');
    }

    const permissions = await queryAll(
      `SELECT permission_code FROM role_permissions WHERE role = ?`,
      [user.role]
    );

    res.json({
      success: true,
      user: {
        ...sanitizeUser(user),
        permissions: permissions.map((p) => p.permission_code),
        workstationId: req.workstationId,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/change-password
authRouter.post('/change-password', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      currentPassword: z.string().min(1, 'Current password is required'),
      newPassword: z.string().min(8, 'New password must be at least 8 characters long')
        .regex(/[A-Za-z]/, 'Password must contain at least one letter')
        .regex(/[0-9]/, 'Password must contain at least one number'),
    });
    const { currentPassword, newPassword } = schema.parse(req.body);

    const user = await queryOne('SELECT password_hash FROM users WHERE id = ?', [req.user!.id]);
    const isValid = await verifyPassword(currentPassword, user.password_hash);
    if (!isValid) {
      throw new AppError('Current password is incorrect', 400, 'INVALID_CURRENT_PASSWORD');
    }

    const newHash = await hashPassword(newPassword);
    const db = getDb();
    await db.execute({
      sql: 'UPDATE users SET password_hash = ?, token_version = token_version + 1, password_changed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      args: [newHash, req.user!.id],
    });

    await logAuditEvent({
      eventType: 'SECURITY_UPDATE',
      actorId: req.user!.id,
      actorName: req.user!.username,
      role: req.user!.role,
      workstationId: req.workstationId!,
      targetTable: 'users',
      targetId: req.user!.id,
      action: 'PASSWORD_CHANGE',
    });

    res.json({ success: true, message: 'Password updated successfully. Other active sessions have been invalidated.' });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/logout
authRouter.post('/logout', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    await db.execute({
      sql: 'UPDATE users SET token_version = token_version + 1 WHERE id = ?',
      args: [req.user!.id],
    });

    await logAuditEvent({
      eventType: 'AUTH_LOGOUT',
      actorId: req.user!.id,
      actorName: req.user!.username,
      role: req.user!.role,
      workstationId: req.workstationId!,
      targetTable: 'users',
      targetId: req.user!.id,
      action: 'LOGOUT',
    });
    res.json({ success: true, message: 'Logged out successfully. Session revoked.' });
  } catch (error) {
    next(error);
  }
});
