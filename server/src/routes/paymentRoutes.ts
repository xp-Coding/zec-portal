import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { queryOne, queryAll, runTransaction } from '../database/db.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission, requireRole } from '../middleware/rbac.js';
import { AppError } from '../middleware/errorHandler.js';
import { logAuditEvent } from '../middleware/audit.js';
import crypto from 'crypto';

export const paymentRouter = Router();
paymentRouter.use(authenticate);
paymentRouter.use(requireRole('admin', 'fee_manager'));

function generateReceiptNo(): string {
  const year = new Date().getFullYear();
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `REC-${year}-${rand}`;
}

const collectPaymentSchema = z.object({
  invoice_id: z.string().min(1, 'Invoice ID is required'),
  amount: z.number().int().min(1, 'Payment amount must be greater than zero'),
  payment_method: z.enum(['cash', 'bank_transfer', 'cheque', 'online', 'pay_order']).default('cash'),
  reference_no: z.string().optional().default(''),
  payment_date: z.string().default(() => new Date().toISOString().split('T')[0]),
  notes: z.string().optional().default(''),
  idempotency_key: z.string().optional(),
});

// POST /api/payments/collect
paymentRouter.post('/collect', requirePermission('payment:collect'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = collectPaymentSchema.parse(req.body);
    const idempotencyKey = data.idempotency_key || `PAY-${data.invoice_id}-${data.amount}-${Date.now()}`;

    // 1. Idempotency Check: if payment with this key already recorded, return existing payment
    const existingPayment = await queryOne(
      'SELECT * FROM fee_payments WHERE idempotency_key = ?',
      [idempotencyKey]
    );
    if (existingPayment) {
      return res.json({
        success: true,
        is_idempotent_replay: true,
        payment: existingPayment,
        message: 'This payment was already confirmed previously.',
      });
    }

    // 2. Load Invoice and verify balance
    const invoice = await queryOne(`
      SELECT inv.*, s.roll_number, s.full_name, s.father_name, c.name as class_name
      FROM fee_invoices inv
      JOIN students s ON inv.student_id = s.id
      JOIN classes c ON s.class_id = c.id
      WHERE inv.id = ?
    `, [data.invoice_id]);

    if (!invoice) {
      throw new AppError('Invoice/Challan not found', 404, 'INVOICE_NOT_FOUND');
    }

    if (invoice.status === 'paid' || invoice.remaining_invoice_balance <= 0) {
      throw new AppError('This challan is already fully paid.', 400, 'INVOICE_ALREADY_PAID');
    }

    if (data.amount > invoice.remaining_invoice_balance) {
      throw new AppError(
        `Payment amount of Rs. ${data.amount.toLocaleString()} exceeds the outstanding balance of Rs. ${invoice.remaining_invoice_balance.toLocaleString()}.`,
        400,
        'AMOUNT_EXCEEDS_BALANCE'
      );
    }

    const paymentId = `pay_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const receiptNo = generateReceiptNo();
    const newRemainingInvoiceBalance = invoice.remaining_invoice_balance - data.amount;
    const newAmountPaid = invoice.amount_paid + data.amount;
    const newStatus = newRemainingInvoiceBalance === 0 ? 'paid' : 'partially_paid';

    // Atomic transaction for payment, invoice update, and allocation
    await runTransaction(async (tx) => {
      // 1. Insert fee_payment
      await tx.execute({
        sql: `INSERT INTO fee_payments (
          id, receipt_no, invoice_id, student_id, amount, payment_method,
          reference_no, cashier_id, workstation_id, payment_date, idempotency_key,
          sync_status, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?)`,
        args: [
          paymentId, receiptNo, invoice.id, invoice.student_id, data.amount, data.payment_method,
          data.reference_no, req.user!.id, req.workstationId || 'WS-MAIN', data.payment_date,
          idempotencyKey, data.notes,
        ],
      });

      // 2. Update fee_invoice
      await tx.execute({
        sql: `UPDATE fee_invoices SET
          amount_paid = ?,
          remaining_invoice_balance = ?,
          status = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
        args: [newAmountPaid, newRemainingInvoiceBalance, newStatus, invoice.id],
      });

      // 3. Insert payment_allocation
      await tx.execute({
        sql: `INSERT INTO payment_allocations (
          id, payment_id, invoice_id, amount_allocated, package_amount_credited
        ) VALUES (?, ?, ?, ?, ?)`,
        args: [`alloc_${Date.now()}`, paymentId, invoice.id, data.amount, data.amount],
      });
    });

    // Calculate updated student package totals
    const studentPaidRow = await queryOne(`
      SELECT COALESCE(SUM(pa.package_amount_credited), 0) as total_package_paid
      FROM payment_allocations pa
      JOIN fee_payments pay ON pa.payment_id = pay.id
      WHERE pay.student_id = ?
    `, [invoice.student_id]);
    const updatedPackagePaid = Number(studentPaidRow?.total_package_paid || 0);
    const updatedPackageBalance = Math.max(0, invoice.total_package_fee - updatedPackagePaid);

    // Tamper-resistant Audit Log
    await logAuditEvent({
      eventType: 'PAYMENT_COLLECTED',
      actorId: req.user!.id,
      actorName: req.user!.username,
      role: req.user!.role,
      workstationId: req.workstationId!,
      targetTable: 'fee_payments',
      targetId: paymentId,
      action: 'COLLECT_FEE',
      afterValue: {
        receipt_no: receiptNo,
        challan_no: invoice.challan_no,
        amount: data.amount,
        payment_method: data.payment_method,
        remaining_balance: newRemainingInvoiceBalance,
      },
    });

    const settings = await queryOne('SELECT * FROM college_settings LIMIT 1');

    res.status(201).json({
      success: true,
      receipt: {
        payment_id: paymentId,
        receipt_no: receiptNo,
        challan_no: invoice.challan_no,
        invoice_id: invoice.id,
        student_id: invoice.student_id,
        student_name: invoice.full_name,
        roll_number: invoice.roll_number,
        father_name: invoice.father_name,
        class_name: invoice.class_name,
        amount: data.amount,
        amount_paid: data.amount,
        payment_method: data.payment_method,
        reference_no: data.reference_no,
        payment_date: data.payment_date,
        cashier_name: req.user!.fullName,
        remaining_invoice_balance: newRemainingInvoiceBalance,
        total_package_fee: invoice.total_package_fee,
        remaining_package_balance: updatedPackageBalance,
        college: settings,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/payments/history
paymentRouter.get('/history', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search, cashier_id, date, page = '1', limit = '50' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
    const offset = (pageNum - 1) * limitNum;

    let whereClause = 'WHERE 1=1';
    const args: any[] = [];

    if (cashier_id) {
      whereClause += ' AND p.cashier_id = ?';
      args.push(cashier_id);
    }

    if (search) {
      whereClause += ' AND (p.receipt_no LIKE ? OR inv.challan_no LIKE ? OR s.roll_number LIKE ? OR s.full_name LIKE ?)';
      const term = `%${search}%`;
      args.push(term, term, term, term);
    }

    if (date) {
      whereClause += ' AND p.payment_date = ?';
      args.push(date);
    }

    const countSql = `
      SELECT COUNT(*) as total
      FROM fee_payments p
      JOIN fee_invoices inv ON p.invoice_id = inv.id
      JOIN students s ON p.student_id = s.id
      ${whereClause}
    `;
    const countRes = await queryOne(countSql, args);
    const total = Number(countRes?.total || 0);

    const sql = `
      SELECT 
        p.*,
        inv.challan_no,
        s.roll_number,
        s.full_name,
        c.name as class_name,
        u.full_name as cashier_name
      FROM fee_payments p
      JOIN fee_invoices inv ON p.invoice_id = inv.id
      JOIN students s ON p.student_id = s.id
      JOIN classes c ON s.class_id = c.id
      JOIN users u ON p.cashier_id = u.id
      ${whereClause}
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const payments = await queryAll(sql, [...args, limitNum, offset]);

    res.json({
      success: true,
      payments,
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

// GET /api/payments/receipt/:receiptNo
paymentRouter.get('/receipt/:receiptNo', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const receiptNo = req.params.receiptNo as string;

    const payment = await queryOne(`
      SELECT 
        p.*,
        inv.challan_no,
        inv.total_package_fee,
        inv.remaining_invoice_balance,
        s.roll_number,
        s.full_name as student_name,
        s.father_name,
        c.name as class_name,
        u.full_name as cashier_name
      FROM fee_payments p
      JOIN fee_invoices inv ON p.invoice_id = inv.id
      JOIN students s ON p.student_id = s.id
      JOIN classes c ON s.class_id = c.id
      JOIN users u ON p.cashier_id = u.id
      WHERE p.receipt_no = ? OR p.id = ?
    `, [receiptNo, receiptNo]);

    if (!payment) {
      throw new AppError('Receipt not found', 404, 'NOT_FOUND');
    }

    const settings = await queryOne('SELECT * FROM college_settings LIMIT 1');

    res.json({
      success: true,
      receipt: {
        ...payment,
        college: settings,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/payments/:id/reverse - Authorize and execute auditable payment reversal (Admin only)
paymentRouter.post('/:id/reverse', requirePermission('payment:refund'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const schema = z.object({
      reason: z.string().min(5, 'Reversal reason must be at least 5 characters long'),
    });
    const { reason } = schema.parse(req.body);

    const payment = await queryOne('SELECT * FROM fee_payments WHERE id = ?', [id]);
    if (!payment) {
      throw new AppError('Payment record not found', 404, 'PAYMENT_NOT_FOUND');
    }

    if (payment.is_reversed === 1) {
      throw new AppError('This payment transaction has already been reversed.', 400, 'PAYMENT_ALREADY_REVERSED');
    }

    const invoice = await queryOne('SELECT * FROM fee_invoices WHERE id = ?', [payment.invoice_id]);
    if (!invoice) {
      throw new AppError('Associated invoice not found for this payment.', 404, 'INVOICE_NOT_FOUND');
    }

    const restoredInvoiceBalance = invoice.remaining_invoice_balance + payment.amount;
    const newAmountPaid = Math.max(0, invoice.amount_paid - payment.amount);
    const newStatus = restoredInvoiceBalance >= invoice.net_payable ? 'unpaid' : 'partially_paid';

    await runTransaction(async (tx) => {
      // 1. Mark payment as reversed
      await tx.execute({
        sql: `UPDATE fee_payments SET 
          is_reversed = 1, reversed_at = CURRENT_TIMESTAMP, reversed_by = ?, reversal_reason = ?
        WHERE id = ?`,
        args: [req.user!.id, reason, payment.id],
      });

      // 2. Restore invoice balance
      await tx.execute({
        sql: `UPDATE fee_invoices SET 
          remaining_invoice_balance = ?, amount_paid = ?, status = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?`,
        args: [restoredInvoiceBalance, newAmountPaid, newStatus, invoice.id],
      });

      // 3. Record in refunds table for auditable trail
      await tx.execute({
        sql: `INSERT INTO refunds (
          id, payment_id, student_id, invoice_id, amount, reason, authorized_by, processed_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [`ref_${Date.now()}`, payment.id, payment.student_id, invoice.id, payment.amount, reason, req.user!.id, req.user!.id],
      });
    });


    // Calculate updated student package balance
    const studentPaidRow = await queryOne(`
      SELECT COALESCE(SUM(pa.package_amount_credited), 0) as total_package_paid
      FROM payment_allocations pa
      JOIN fee_payments pay ON pa.payment_id = pay.id
      WHERE pay.student_id = ? AND pay.is_reversed = 0
    `, [payment.student_id]);
    const updatedPackagePaid = Number(studentPaidRow?.total_package_paid || 0);
    const updatedPackageBalance = Math.max(0, invoice.total_package_fee - updatedPackagePaid);

    await logAuditEvent({
      eventType: 'PAYMENT_REVERSED',
      actorId: req.user!.id,
      actorName: req.user!.username,
      role: req.user!.role,
      workstationId: req.workstationId || 'WS-ADMIN',
      targetTable: 'fee_payments',
      targetId: payment.id,
      action: 'REVERSE_PAYMENT',
      beforeValue: {
        receipt_no: payment.receipt_no,
        amount: payment.amount,
        status: 'active',
      },
      afterValue: {
        receipt_no: payment.receipt_no,
        is_reversed: 1,
        reversal_reason: reason,
        restored_invoice_balance: restoredInvoiceBalance,
        remaining_package_balance: updatedPackageBalance,
      },
      reason,
    });

    res.json({
      success: true,
      message: `Payment receipt #${payment.receipt_no} reversed successfully. Rs. ${payment.amount.toLocaleString()} restored to invoice balance.`,
      reversal: {
        payment_id: payment.id,
        receipt_no: payment.receipt_no,
        amount_reversed: payment.amount,
        new_invoice_balance: restoredInvoiceBalance,
        new_package_balance: updatedPackageBalance,
        invoice_status: newStatus,
      },
    });
  } catch (error) {
    next(error);
  }
});
