import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { queryOne, queryAll, getDb } from '../database/db.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission, requireRole } from '../middleware/rbac.js';
import { AppError } from '../middleware/errorHandler.js';
import { logAuditEvent } from '../middleware/audit.js';

export const feeRouter = Router();
feeRouter.use(authenticate);
feeRouter.use(requireRole('admin', 'fee_manager'));

// ==========================================
// 1. Fee Structures
// ==========================================

// GET /api/fees/structures
feeRouter.get('/structures', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { session_id, class_id, program_id } = req.query;
    let sql = `
      SELECT fs.*, p.name as program_name, c.name as class_name, sess.name as session_name
      FROM fee_structures fs
      LEFT JOIN programs p ON fs.program_id = p.id
      LEFT JOIN classes c ON fs.class_id = c.id
      JOIN academic_sessions sess ON fs.academic_session_id = sess.id
      WHERE 1=1
    `;
    const args: any[] = [];

    if (session_id) {
      sql += ' AND fs.academic_session_id = ?';
      args.push(session_id);
    }
    if (class_id) {
      sql += ' AND fs.class_id = ?';
      args.push(class_id);
    }
    if (program_id) {
      sql += ' AND fs.program_id = ?';
      args.push(program_id);
    }

    sql += ' ORDER BY fs.fee_head ASC, fs.amount DESC';

    const structures = await queryAll(sql, args);
    res.json({ success: true, structures });
  } catch (error) {
    next(error);
  }
});

// POST /api/fees/structures
feeRouter.post('/structures', requirePermission('fee:manage_structure'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      academic_session_id: z.string().min(1),
      program_id: z.string().optional(),
      class_id: z.string().optional(),
      fee_head: z.enum(['admission', 'tuition', 'semester', 'exam', 'lab', 'transport', 'library', 'other']),
      fee_head_name: z.string().min(1),
      amount: z.number().int().min(0),
      billing_frequency: z.enum(['one_time', 'monthly', 'per_semester', 'annual']).default('monthly'),
      is_optional: z.boolean().default(false),
    });

    const data = schema.parse(req.body);
    const db = getDb();
    const id = `feestr_${Date.now()}`;

    await db.execute({
      sql: `INSERT INTO fee_structures (
        id, academic_session_id, program_id, class_id, fee_head,
        fee_head_name, amount, billing_frequency, is_optional, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      args: [
        id, data.academic_session_id, data.program_id || null, data.class_id || null,
        data.fee_head, data.fee_head_name, data.amount, data.billing_frequency,
        data.is_optional ? 1 : 0,
      ],
    });

    await logAuditEvent({
      eventType: 'FEE_STRUCTURE_CREATED',
      actorId: req.user!.id,
      actorName: req.user!.username,
      role: req.user!.role,
      workstationId: req.workstationId!,
      targetTable: 'fee_structures',
      targetId: id,
      action: 'CREATE_FEE_STRUCTURE',
      afterValue: data,
    });

    const created = await queryOne('SELECT * FROM fee_structures WHERE id = ?', [id]);
    res.status(201).json({ success: true, structure: created });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/fees/structures/:id
feeRouter.delete('/structures/:id', requirePermission('fee:manage_structure'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const db = getDb();

    const existing = await queryOne('SELECT * FROM fee_structures WHERE id = ?', [id]);
    if (!existing) {
      throw new AppError('Fee structure not found', 404, 'NOT_FOUND');
    }

    await db.execute({ sql: 'DELETE FROM fee_structures WHERE id = ?', args: [id as string] });

    await logAuditEvent({
      eventType: 'FEE_STRUCTURE_DELETED',
      actorId: req.user!.id,
      actorName: req.user!.username,
      role: req.user!.role,
      workstationId: req.workstationId!,
      targetTable: 'fee_structures',
      targetId: id as string,
      action: 'DELETE_FEE_STRUCTURE',
      beforeValue: existing,
    });

    res.json({ success: true, message: 'Fee structure deleted' });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// 2. Fee Adjustments (Scholarships, Waivers, Fines)
// ==========================================

// POST /api/fees/adjustments
feeRouter.post('/adjustments', requirePermission('fee:adjust'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      student_id: z.string().min(1),
      invoice_id: z.string().optional(),
      adjustment_type: z.enum(['scholarship', 'concession', 'waiver', 'fine', 'reversal', 'correction']),
      amount: z.number().int().refine((n) => n !== 0, 'Amount cannot be zero'),
      reason: z.string().min(3, 'Detailed justification reason is required'),
    });

    const data = schema.parse(req.body);
    const db = getDb();
    const id = `adj_${Date.now()}`;

    await db.execute({
      sql: `INSERT INTO fee_adjustments (
        id, student_id, invoice_id, adjustment_type, amount, reason, authorized_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id, data.student_id, data.invoice_id || null, data.adjustment_type,
        data.amount, data.reason, req.user!.id,
      ],
    });

    // If applied directly to an invoice, adjust the invoice remaining balance
    if (data.invoice_id) {
      const inv = await queryOne('SELECT remaining_invoice_balance FROM fee_invoices WHERE id = ?', [data.invoice_id]);
      if (inv) {
        // Waivers/scholarships reduce the payable amount; fines increase it
        let adjustmentToApply = -data.amount; // e.g. waiver of 1000 reduces balance by 1000
        if (data.adjustment_type === 'fine') {
          adjustmentToApply = Math.abs(data.amount);
        }
        const updatedBalance = Math.max(0, inv.remaining_invoice_balance + adjustmentToApply);
        const updatedStatus = updatedBalance === 0 ? 'paid' : 'partially_paid';

        await db.execute({
          sql: 'UPDATE fee_invoices SET remaining_invoice_balance = ?, status = ? WHERE id = ?',
          args: [updatedBalance, updatedStatus, data.invoice_id],
        });
      }
    }

    await logAuditEvent({
      eventType: 'FEE_ADJUSTMENT_APPROVED',
      actorId: req.user!.id,
      actorName: req.user!.username,
      role: req.user!.role,
      workstationId: req.workstationId!,
      targetTable: 'fee_adjustments',
      targetId: id,
      action: 'APPROVE_FEE_ADJUSTMENT',
      afterValue: data,
      reason: data.reason,
    });

    const created = await queryOne('SELECT * FROM fee_adjustments WHERE id = ?', [id]);
    res.status(201).json({ success: true, adjustment: created });
  } catch (error) {
    next(error);
  }
});
