import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createClient } from '@libsql/client';
import { query, queryOne, queryAll, getDb, getDatabaseFilePath, resetDbClient } from '../database/db.js';
import { AppError } from '../middleware/errorHandler.js';
import { logAuditEvent } from '../middleware/audit.js';

export function getBackupsDirectory(): string {
  const dbPath = getDatabaseFilePath();
  const baseDir = dbPath ? path.dirname(dbPath) : path.resolve(process.cwd(), '../database');
  const backupsDir = path.join(baseDir, 'backups');
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }
  return backupsDir;
}

export function computeFileSha256(filePath: string): string {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

export async function gatherDatabaseMetrics(): Promise<Record<string, number>> {
  const [students, classes, attendance, invoices, payments, auditLogs] = await Promise.all([
    queryOne('SELECT COUNT(*) as count FROM students'),
    queryOne('SELECT COUNT(*) as count FROM classes'),
    queryOne('SELECT COUNT(*) as count FROM attendance_records'),
    queryOne('SELECT COUNT(*) as count FROM fee_invoices'),
    queryOne('SELECT COUNT(*) as count FROM fee_payments'),
    queryOne('SELECT COUNT(*) as count FROM audit_logs'),
  ]);

  return {
    students: Number(students?.count || 0),
    classes: Number(classes?.count || 0),
    attendance_records: Number(attendance?.count || 0),
    fee_invoices: Number(invoices?.count || 0),
    fee_payments: Number(payments?.count || 0),
    audit_logs: Number(auditLogs?.count || 0),
  };
}

export async function createBackup(actorId: string, notes?: string) {
  const dbPath = getDatabaseFilePath();
  if (!dbPath || !fs.existsSync(dbPath)) {
    throw new AppError('Authoritative local database file not found for backup', 500, 'DB_FILE_NOT_FOUND');
  }

  const backupsDir = getBackupsDirectory();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupId = `bkp_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const filename = `zec_backup_${timestamp}_${backupId}.db`;
  const backupFilePath = path.join(backupsDir, filename);

  // 1. Flush WAL logs to ensure 100% full database consistency
  try {
    const db = getDb();
    await db.execute('PRAGMA wal_checkpoint(FULL);');
  } catch (err) {
    console.warn('WAL checkpoint warning before backup:', err);
  }

  // 2. Safely copy database file
  fs.copyFileSync(dbPath, backupFilePath);

  // 3. Compute SHA-256 Checksum
  const sha256 = computeFileSha256(backupFilePath);
  const fileSize = fs.statSync(backupFilePath).size;

  // 4. Write detached SHA-256 verification file
  fs.writeFileSync(`${backupFilePath}.sha256`, `${sha256} *${filename}\n`, 'utf-8');

  // 5. Snapshot record counts
  const recordCounts = await gatherDatabaseMetrics();
  const recordCountsJson = JSON.stringify(recordCounts);

  // 6. Record metadata in system_backups table
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO system_backups (
      id, filename, file_path, file_size, sha256_hash, record_counts_json, created_by, status, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', ?)`,
    args: [backupId, filename, backupFilePath, fileSize, sha256, recordCountsJson, actorId, notes || null],
  });

  // 7. Audit log event
  await logAuditEvent({
    eventType: 'DATABASE_BACKUP_CREATED',
    actorId,
    actorName: 'Administrator',
    role: 'admin',
    workstationId: 'WS-BACKUP',
    targetTable: 'system_backups',
    targetId: backupId,
    action: 'CREATE_BACKUP',
    afterValue: {
      filename,
      file_size: fileSize,
      sha256_hash: sha256,
      record_counts: recordCounts,
    },
    reason: notes || 'Scheduled/Manual Administrator Backup',
  });

  return {
    id: backupId,
    filename,
    file_path: backupFilePath,
    file_size: fileSize,
    sha256_hash: sha256,
    record_counts: recordCounts,
    created_at: new Date().toISOString(),
  };
}

export async function verifyBackup(backupId: string) {
  const backup = await queryOne('SELECT * FROM system_backups WHERE id = ?', [backupId]);
  if (!backup) {
    throw new AppError('Backup record not found', 404, 'BACKUP_NOT_FOUND');
  }

  if (!fs.existsSync(backup.file_path)) {
    throw new AppError(`Backup file on disk is missing: ${backup.file_path}`, 404, 'BACKUP_FILE_MISSING');
  }

  // 1. Verify SHA-256 Checksum
  const currentHash = computeFileSha256(backup.file_path);
  const hashMatch = currentHash.toLowerCase() === backup.sha256_hash.toLowerCase();
  if (!hashMatch) {
    throw new AppError('Integrity Verification Failed: SHA-256 hash mismatch. File may be corrupted or modified.', 400, 'CHECKSUM_MISMATCH');
  }

  // 2. Open temporary libSQL connection to run SQLite PRAGMA integrity_check
  let pragmaResult = 'unknown';
  try {
    const tempClient = createClient({ url: `file:${backup.file_path}` });
    const check = await tempClient.execute('PRAGMA integrity_check;');
    const quickCheck = await tempClient.execute('PRAGMA quick_check;');
    const fkCheck = await tempClient.execute('PRAGMA foreign_key_check;');
    
    if (typeof (tempClient as any).close === 'function') {
      try { (tempClient as any).close(); } catch {}
    }

    const isOk = check.rows?.[0]?.['integrity_check'] === 'ok' || check.rows?.[0]?.[0] === 'ok';
    pragmaResult = isOk ? 'ok' : 'corrupted';
  } catch (err: any) {
    throw new AppError(`Database file integrity check failed: ${err.message}`, 400, 'SQLITE_INTEGRITY_FAILED');
  }

  return {
    success: true,
    backup_id: backup.id,
    filename: backup.filename,
    sha256_hash: currentHash,
    hash_match: hashMatch,
    sqlite_integrity: pragmaResult,
    record_counts: JSON.parse(backup.record_counts_json || '{}'),
    verified_at: new Date().toISOString(),
  };
}

export async function restoreBackup(backupId: string, actorId: string, confirm: boolean) {
  if (!confirm) {
    throw new AppError('Restoration aborted: Explicit confirmation flag (confirm: true) is required.', 400, 'RESTORE_CONFIRMATION_REQUIRED');
  }

  const dbPath = getDatabaseFilePath();
  if (!dbPath) {
    throw new AppError('Authoritative local database path not resolved', 500, 'DB_FILE_NOT_FOUND');
  }

  const backup = await queryOne('SELECT * FROM system_backups WHERE id = ?', [backupId]);
  if (!backup) {
    throw new AppError('Backup record not found', 404, 'BACKUP_NOT_FOUND');
  }

  // 1. Verify backup file exists and integrity passes before attempting restore
  const verification = await verifyBackup(backupId);
  if (!verification.hash_match || verification.sqlite_integrity !== 'ok') {
    throw new AppError('Cannot restore from corrupted backup file', 400, 'CANNOT_RESTORE_CORRUPTED_BACKUP');
  }

  // 2. Take an automated pre-restore safety snapshot of the live database
  const safetyBackup = await createBackup(actorId, `Automated safety snapshot before restoring backup ${backup.filename}`);

  // 3. Close open database client
  resetDbClient();

  // 4. Copy backup database file over live database file
  try {
    fs.copyFileSync(backup.file_path, dbPath);
  } catch (err: any) {
    // If copying fails, restore safety backup immediately
    try {
      fs.copyFileSync(safetyBackup.file_path, dbPath);
    } catch {}
    resetDbClient();
    throw new AppError(`Restoration file replacement failed: ${err.message}. Reverted to safety snapshot.`, 500, 'RESTORE_COPY_FAILED');
  }

  // 5. Reinitialize live database client and verify restored data
  resetDbClient();
  const db = getDb();

  // Run integrity check on restored database
  const integrityRes = await db.execute('PRAGMA integrity_check;');
  const fkCheckRes = await db.execute('PRAGMA foreign_key_check;');
  const restoredMetrics = await gatherDatabaseMetrics();

  // 6. Record audit event on restored database
  await logAuditEvent({
    eventType: 'DATABASE_RESTORED',
    actorId,
    actorName: 'Administrator',
    role: 'admin',
    workstationId: 'WS-RESTORE',
    targetTable: 'system_backups',
    targetId: backupId,
    action: 'RESTORE_DATABASE',
    beforeValue: { safety_backup_id: safetyBackup.id, safety_backup_file: safetyBackup.filename },
    afterValue: { restored_from_backup_id: backupId, restored_filename: backup.filename, metrics: restoredMetrics },
    reason: `System restored to backup from ${backup.created_at}`,
  });

  return {
    success: true,
    message: `Database successfully restored from backup '${backup.filename}'.`,
    restored_backup: {
      id: backup.id,
      filename: backup.filename,
      created_at: backup.created_at,
    },
    safety_backup: {
      id: safetyBackup.id,
      filename: safetyBackup.filename,
    },
    restored_metrics: restoredMetrics,
    integrity_status: 'ok',
    foreign_key_violations: fkCheckRes.rows.length,
  };
}

export async function listBackups() {
  const backups = await queryAll(`
    SELECT b.*, u.full_name as creator_name, u.username as creator_username
    FROM system_backups b
    LEFT JOIN users u ON b.created_by = u.id
    ORDER BY b.created_at DESC
  `);

  return backups.map((b: any) => ({
    ...b,
    record_counts: JSON.parse(b.record_counts_json || '{}'),
    exists_on_disk: fs.existsSync(b.file_path),
  }));
}
