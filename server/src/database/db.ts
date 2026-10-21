import { createClient, Client } from '@libsql/client';
import path from 'path';
import fs from 'fs';
import { config } from '../config.js';

let dbClient: Client | null = null;

export function getDb(): Client {
  if (dbClient) {
    return dbClient;
  }

  // If local file path, ensure directory exists
  if (config.database.url.startsWith('file:')) {
    const rawPath = config.database.url.replace(/^file:/, '');
    const absolutePath = path.isAbsolute(rawPath) 
      ? rawPath 
      : path.resolve(process.cwd(), rawPath);
    const dir = path.dirname(absolutePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  dbClient = createClient({
    url: config.database.url,
    authToken: config.database.authToken,
  });

  return dbClient;
}

/**
 * Execute a query with parameters safely
 */
export async function query(sql: string, args: any[] = []) {
  const db = getDb();
  return await db.execute({ sql, args });
}

/**
 * Query and return first row as typed object
 */
export async function queryOne<T = any>(sql: string, args: any[] = []): Promise<T | null> {
  const result = await query(sql, args);
  if (!result.rows || result.rows.length === 0) {
    return null;
  }
  return result.rows[0] as unknown as T;
}

/**
 * Query and return all rows as array of typed objects
 */
export async function queryAll<T = any>(sql: string, args: any[] = []): Promise<T[]> {
  const result = await query(sql, args);
  if (!result.rows) {
    return [];
  }
  return result.rows as unknown as T[];
}

/**
 * Execute multiple statements in an atomic transaction
 */
export async function runTransaction(operations: (tx: any) => Promise<any>) {
  const db = getDb();
  const tx = await db.transaction('write');
  try {
    const result = await operations(tx);
    await tx.commit();
    return result;
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

/**
 * Get absolute path to the local SQLite database file, if configured as file:
 */
export function getDatabaseFilePath(): string | null {
  if (config.database.url.startsWith('file:')) {
    const rawPath = config.database.url.replace(/^file:/, '');
    return path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);
  }
  return null;
}

/**
 * Reset and close active database client connection (for clean restore recovery)
 */
export function resetDbClient() {
  if (dbClient && typeof (dbClient as any).close === 'function') {
    try {
      (dbClient as any).close();
    } catch {
      // ignore
    }
  }
  dbClient = null;
}
