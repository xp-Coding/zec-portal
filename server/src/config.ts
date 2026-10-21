import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from server directory or project root
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '4000', 10),
  host: process.env.HOST || '0.0.0.0',
  jwtSecret: process.env.JWT_SECRET || 'zec-academia-fee-pro-super-secure-jwt-secret-key-2026',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  
  // Database configuration: Supports local SQLite file or remote Turso/libSQL URL
  database: {
    url: process.env.NODE_ENV === 'test'
      ? (process.env.TEST_DATABASE_URL || 'file:../database/academia_fee_test.db')
      : (process.env.DATABASE_URL || 'file:../database/academia_fee.db'),
    authToken: process.env.NODE_ENV === 'test'
      ? process.env.TEST_DATABASE_AUTH_TOKEN
      : (process.env.DATABASE_AUTH_TOKEN || undefined),
  },
  
  // College Details
  college: {
    name: 'Zakariya Educational Complex',
    shortName: 'ZEC',
    currency: 'PKR',
    defaultDueDay: 10,
    lateFinePerDay: 20,
    timezone: 'Asia/Karachi',
  },
  
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:1420,http://127.0.0.1:1420,http://localhost:5173,http://127.0.0.1:5173,tauri://localhost').split(','),
};
