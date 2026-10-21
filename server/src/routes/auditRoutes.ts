import { Router, Request, Response, NextFunction } from 'express';
import { queryOne, queryAll } from '../database/db.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';

export const auditRouter = Router();
auditRouter.use(authenticate);

// GET /api/audit
auditRouter.get('/', requirePermission('audit:view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { event_type, actor, target_table, page = '1', limit = '50' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
    const offset = (pageNum - 1) * limitNum;

    let whereSql = 'WHERE 1=1';
    const args: any[] = [];

    if (event_type) {
      whereSql += ' AND event_type = ?';
      args.push(event_type);
    }
    if (actor) {
      whereSql += ' AND (actor_name LIKE ? OR role LIKE ?)';
      const term = `%${actor}%`;
      args.push(term, term);
    }
    if (target_table) {
      whereSql += ' AND target_table = ?';
      args.push(target_table);
    }

    const countRes = await queryOne(`SELECT COUNT(*) as total FROM audit_logs ${whereSql}`, args);
    const total = Number(countRes?.total || 0);

    const logs = await queryAll(
      `SELECT * FROM audit_logs ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...args, limitNum, offset]
    );

    res.json({
      success: true,
      logs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/audit/diagnostics
auditRouter.get('/diagnostics', requirePermission('audit:view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dbTest = await queryOne('SELECT 1 as connected');
    const workstationsCount = await queryOne('SELECT COUNT(*) as count FROM workstations WHERE is_active = 1');
    const outboxPending = await queryOne("SELECT COUNT(*) as count FROM sync_outbox WHERE status = 'pending'");
    const conflictCount = await queryOne("SELECT COUNT(*) as count FROM sync_conflicts WHERE resolution_status = 'unresolved'");
    const latestAudit = await queryOne('SELECT created_at FROM audit_logs ORDER BY created_at DESC LIMIT 1');

    res.json({
      success: true,
      diagnostics: {
        server_status: 'online',
        database_connected: dbTest?.connected === 1,
        active_workstations: Number(workstationsCount?.count || 0),
        pending_sync_items: Number(outboxPending?.count || 0),
        unresolved_conflicts: Number(conflictCount?.count || 0),
        last_audit_event_at: latestAudit?.created_at || null,
        current_workstation: req.workstationId || 'WS-MAIN',
        node_version: process.version,
        uptime_seconds: Math.floor(process.uptime()),
      },
    });
  } catch (error) {
    next(error);
  }
});
