import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { queryOne, queryAll, getDb } from '../database/db.js';
import { authenticate } from '../middleware/auth.js';
import { logAuditEvent } from '../middleware/audit.js';

export const syncRouter = Router();
syncRouter.use(authenticate);

// GET /api/sync/status
syncRouter.get('/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workstationId = req.workstationId || 'WS-MAIN';

    const pendingCount = await queryOne(
      "SELECT COUNT(*) as count FROM sync_outbox WHERE workstation_id = ? AND status = 'pending'",
      [workstationId]
    );

    const conflicts = await queryAll(
      "SELECT * FROM sync_conflicts WHERE workstation_id = ? AND resolution_status = 'unresolved'",
      [workstationId]
    );

    res.json({
      success: true,
      sync_status: {
        workstation_id: workstationId,
        pending_outbox_count: Number(pendingCount?.count || 0),
        unresolved_conflicts: conflicts,
        server_time: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/sync/outbox (Workstation sync push)
syncRouter.post('/outbox', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      operations: z.array(z.object({
        transaction_id: z.string(),
        entity_type: z.string(),
        operation: z.enum(['insert', 'update', 'delete']),
        payload: z.record(z.any()),
      })),
    });

    const { operations } = schema.parse(req.body);
    const db = getDb();
    const workstationId = req.workstationId || 'WS-MAIN';
    const processed: string[] = [];
    const conflicts: any[] = [];

    for (const op of operations) {
      // Check idempotency in sync_outbox
      const existing = await queryOne('SELECT * FROM sync_outbox WHERE transaction_id = ?', [op.transaction_id]);
      if (existing) {
        processed.push(op.transaction_id);
        continue;
      }

      await db.execute({
        sql: `INSERT INTO sync_outbox (
          id, transaction_id, entity_type, operation, payload,
          workstation_id, user_id, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'completed')`,
        args: [
          `out_${Date.now()}`, op.transaction_id, op.entity_type, op.operation,
          JSON.stringify(op.payload), workstationId, req.user!.id,
        ],
      });

      processed.push(op.transaction_id);
    }

    await logAuditEvent({
      eventType: 'SYNC_TRANSACTIONS_PROCESSED',
      actorId: req.user!.id,
      actorName: req.user!.username,
      role: req.user!.role,
      workstationId,
      targetTable: 'sync_outbox',
      targetId: `batch_${Date.now()}`,
      action: 'SYNC_PUSH',
      afterValue: { processed_count: processed.length, conflicts_count: conflicts.length },
    });

    res.json({
      success: true,
      processed_transaction_ids: processed,
      conflicts,
    });
  } catch (error) {
    next(error);
  }
});
