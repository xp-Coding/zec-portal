import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';

let argon2Module: any = null;
let argon2Checked = false;

async function getArgon2() {
  if (!argon2Checked) {
    try {
      argon2Module = await import('@node-rs/argon2');
    } catch {
      argon2Module = null;
    }
    argon2Checked = true;
  }
  return argon2Module;
}

export interface TokenPayload {
  userId: string;
  username: string;
  role: string;
  fullName: string;
  workstationId?: string;
  tokenVersion?: number;
}

/**
 * Hash password securely using Argon2id or strong bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  const argon = await getArgon2();
  if (argon && argon.hash) {
    try {
      return await argon.hash(password, {
        memoryCost: 19456,
        timeCost: 2,
        outputLen: 32,
        parallelism: 1,
      });
    } catch {
      // Fallback if argon execution encounters platform issues
    }
  }
  return bcrypt.hash(password, 12);
}

/**
 * Verify password against stored hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (hash.startsWith('$argon2')) {
    const argon = await getArgon2();
    if (argon && argon.verify) {
      try {
        return await argon.verify(hash, password);
      } catch {
        return false;
      }
    }
  }
  return bcrypt.compare(password, hash);
}

/**
 * Sign JWT token for authenticated session
 */
export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as any,
  });
}

/**
 * Verify JWT token
 */
export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, config.jwtSecret) as TokenPayload;
}

/**
 * Sanitize user object to never leak password hashes or sensitive fields
 */
export function sanitizeUser(user: any) {
  if (!user) return null;
  const { password_hash, ...safeUser } = user;
  return safeUser;
}
