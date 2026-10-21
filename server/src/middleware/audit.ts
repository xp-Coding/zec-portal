import { getDb } from '../database/db.js';
import crypto from 'crypto';

export interface AuditLogEntry {
  eventType: string;
  actorId?: string;
  actorName: string;
  role: string;
  workstationId: string;
  targetTable: string;
  targetId: string;
  action: string;
  beforeValue?: any;
  afterValue?: any;
  reason?: string;
  details?: any;
  ipAddress?: string;
}

/**
 * Record an immutable audit log entry into the database
 */
export async function logAuditEvent(entry: AuditLogEntry) {
  try {
    const db = getDb();
    const id = `aud_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const effectiveAfter = entry.afterValue ?? entry.details;
    
    await db.execute({
      sql: `INSERT INTO audit_logs (
        id, event_type, actor_id, actor_name, role, workstation_id,
        target_table, target_id, action, before_value, after_value, reason, ip_address
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        entry.eventType,
        entry.actorId || null,
        entry.actorName,
        entry.role,
        entry.workstationId || 'WS-UNKNOWN',
        entry.targetTable,
        entry.targetId,
        entry.action,
        entry.beforeValue ? JSON.stringify(entry.beforeValue) : null,
        effectiveAfter ? JSON.stringify(effectiveAfter) : null,
        entry.reason || null,
        entry.ipAddress || null,
      ],
    });
  } catch (err) {
    // Audit log errors must never crash the primary process, but should be logged to stderr
    console.error('Failed to write audit log entry:', err);
  }
}
