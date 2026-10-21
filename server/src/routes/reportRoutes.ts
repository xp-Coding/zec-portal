import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { queryOne, queryAll, getDb } from '../database/db.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission, requireRole } from '../middleware/rbac.js';
import { AppError } from '../middleware/errorHandler.js';
import { logAuditEvent } from '../middleware/audit.js';

export const reportRouter = Router();
reportRouter.use(authenticate);
reportRouter.use(requireRole('admin', 'fee_manager'));

// ==========================================
// 1. Financial Analytics Dashboard Metrics
// ==========================================

// GET /api/reports/analytics
reportRouter.get('/analytics', requirePermission('reports:view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { session_id, start_date, end_date } = req.query;

    let invoiceFilter = 'WHERE 1=1';
    let paymentFilter = 'WHERE 1=1';
    const invoiceArgs: any[] = [];
    const paymentArgs: any[] = [];

    if (session_id) {
      invoiceFilter += ' AND academic_session_id = ?';
      invoiceArgs.push(session_id);
    }
    if (start_date) {
      invoiceFilter += ' AND issue_date >= ?';
      invoiceArgs.push(start_date);
      paymentFilter += ' AND payment_date >= ?';
      paymentArgs.push(start_date);
    }
    if (end_date) {
      invoiceFilter += ' AND issue_date <= ?';
      invoiceArgs.push(end_date);
      paymentFilter += ' AND payment_date <= ?';
      paymentArgs.push(end_date);
    }

    // 1. Active Students
    const studentCountRow = await queryOne(
      "SELECT COUNT(*) as count FROM students WHERE status = 'active'"
    );
    const activeStudents = Number(studentCountRow?.count || 0);

    // 2. Invoices Aggregate
    const invoiceStats = await queryOne(`
      SELECT 
        COALESCE(SUM(net_payable), 0) as total_billed,
        COALESCE(SUM(remaining_invoice_balance), 0) as total_outstanding,
        COUNT(*) as total_invoices,
        SUM(CASE WHEN status = 'unpaid' THEN 1 ELSE 0 END) as unpaid_count,
        SUM(CASE WHEN status = 'partially_paid' THEN 1 ELSE 0 END) as partially_paid_count,
        SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) as paid_count,
        SUM(CASE WHEN due_date < date('now') AND remaining_invoice_balance > 0 THEN 1 ELSE 0 END) as overdue_count,
        COALESCE(SUM(CASE WHEN due_date < date('now') THEN remaining_invoice_balance ELSE 0 END), 0) as overdue_amount
      FROM fee_invoices
      ${invoiceFilter}
    `, invoiceArgs);

    // 3. Payments Aggregate
    const paymentStats = await queryOne(`
      SELECT 
        COALESCE(SUM(amount), 0) as total_collected,
        COUNT(*) as total_transactions
      FROM fee_payments
      ${paymentFilter}
    `, paymentArgs);

    // 4. Payment Methods Breakdown
    const paymentMethods = await queryAll(`
      SELECT payment_method, COUNT(*) as count, COALESCE(SUM(amount), 0) as total_amount
      FROM fee_payments
      ${paymentFilter}
      GROUP BY payment_method
    `, paymentArgs);

    // 5. Total Cumulative Package Commitments vs Collected
    const packageStats = await queryOne(`
      SELECT 
        COALESCE(SUM(total_package_fee), 0) as total_package_commitments,
        (
          SELECT COALESCE(SUM(package_amount_credited), 0)
          FROM payment_allocations
        ) as total_package_paid
      FROM students
      WHERE status = 'active'
    `);

    const totalBilled = Number(invoiceStats?.total_billed || 0);
    const totalCollected = Number(paymentStats?.total_collected || 0);
    const realizationRate = totalBilled > 0 ? ((totalCollected / totalBilled) * 100).toFixed(1) : '100.0';

    const totalPackageCommitments = Number(packageStats?.total_package_commitments || 0);
    const totalPackagePaid = Number(packageStats?.total_package_paid || 0);
    const remainingPackageCommitments = Math.max(0, totalPackageCommitments - totalPackagePaid);

    res.json({
      success: true,
      metrics: {
        active_students: activeStudents,
        total_billed: totalBilled,
        total_collected: totalCollected,
        total_outstanding_invoices: Number(invoiceStats?.total_outstanding || 0),
        realization_rate_pct: parseFloat(realizationRate),
        unpaid_invoices_count: Number(invoiceStats?.unpaid_count || 0),
        partially_paid_invoices_count: Number(invoiceStats?.partially_paid_count || 0),
        paid_invoices_count: Number(invoiceStats?.paid_count || 0),
        overdue_invoices_count: Number(invoiceStats?.overdue_count || 0),
        overdue_amount: Number(invoiceStats?.overdue_amount || 0),
        total_package_commitments: totalPackageCommitments,
        total_package_paid: totalPackagePaid,
        remaining_package_commitments: remainingPackageCommitments,
      },
      payment_methods: paymentMethods,
    });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// 2. Defaulters List
// ==========================================

// GET /api/reports/defaulters
reportRouter.get('/defaulters', requirePermission('reports:view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { class_id, min_days = '0' } = req.query;
    const minDaysNum = parseInt(min_days as string, 10) || 0;

    let whereSql = `WHERE inv.status IN ('unpaid', 'partially_paid', 'overdue') AND inv.due_date < date('now')`;
    const args: any[] = [];

    if (class_id) {
      whereSql += ' AND s.class_id = ?';
      args.push(class_id);
    }

    const sql = `
      SELECT 
        s.id as student_id,
        s.roll_number,
        s.full_name as student_name,
        s.father_name,
        s.guardian_phone,
        c.name as class_name,
        p.name as program_name,
        s.total_package_fee,
        COUNT(inv.id) as overdue_invoices_count,
        MIN(inv.due_date) as oldest_due_date,
        CAST((julianday('now') - julianday(MIN(inv.due_date))) AS INTEGER) as days_overdue,
        SUM(inv.remaining_invoice_balance) as total_overdue_amount,
        (
          SELECT COALESCE(SUM(remaining_invoice_balance), 0)
          FROM fee_invoices
          WHERE student_id = s.id AND status IN ('unpaid', 'partially_paid', 'overdue')
        ) as total_outstanding_balance,
        (
          SELECT COALESCE(SUM(pa.package_amount_credited), 0)
          FROM payment_allocations pa
          JOIN fee_payments pay ON pa.payment_id = pay.id
          WHERE pay.student_id = s.id
        ) as package_paid
      FROM fee_invoices inv
      JOIN students s ON inv.student_id = s.id
      JOIN classes c ON s.class_id = c.id
      JOIN programs p ON s.program_id = p.id
      ${whereSql}
      GROUP BY s.id
      HAVING days_overdue >= ?
      ORDER BY days_overdue DESC, total_overdue_amount DESC
    `;

    const defaulters = await queryAll(sql, [...args, minDaysNum]);

    res.json({
      success: true,
      defaulters: defaulters.map((d: any) => ({
        ...d,
        remaining_package_balance: Math.max(0, d.total_package_fee - Number(d.package_paid || 0)),
      })),
    });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// 3. Cashier Daybook & Daily Reconciliation
// ==========================================

// GET /api/reports/daybook
reportRouter.get('/daybook', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { date = new Date().toISOString().split('T')[0], cashier_id } = req.query;

    let whereSql = 'WHERE p.payment_date = ?';
    const args: any[] = [date];

    if (cashier_id) {
      whereSql += ' AND p.cashier_id = ?';
      args.push(cashier_id);
    }

    // Total collections by method
    const methodsSummary = await queryAll(`
      SELECT 
        p.payment_method,
        COUNT(*) as transaction_count,
        COALESCE(SUM(p.amount), 0) as total_amount
      FROM fee_payments p
      ${whereSql}
      GROUP BY p.payment_method
    `, args);

    // List of payments for the day
    const payments = await queryAll(`
      SELECT 
        p.*,
        inv.challan_no,
        s.roll_number,
        s.full_name as student_name,
        c.name as class_name,
        u.full_name as cashier_name
      FROM fee_payments p
      JOIN fee_invoices inv ON p.invoice_id = inv.id
      JOIN students s ON p.student_id = s.id
      JOIN classes c ON s.class_id = c.id
      JOIN users u ON p.cashier_id = u.id
      ${whereSql}
      ORDER BY p.created_at ASC
    `, args);

    const totalCash = methodsSummary
      .filter((m) => m.payment_method === 'cash')
      .reduce((sum, m) => sum + Number(m.total_amount), 0);

    const totalNonCash = methodsSummary
      .filter((m) => m.payment_method !== 'cash')
      .reduce((sum, m) => sum + Number(m.total_amount), 0);

    const totalCollected = totalCash + totalNonCash;

    // Check existing reconciliation session
    const targetCashierId = (cashier_id as string) || req.user!.id;
    const session = await queryOne(`
      SELECT * FROM cashier_sessions
      WHERE cashier_id = ? AND date(opened_at) = ?
      ORDER BY opened_at DESC LIMIT 1
    `, [targetCashierId, date]);

    res.json({
      success: true,
      date,
      summary: {
        total_collected: totalCollected,
        total_cash: totalCash,
        total_non_cash: totalNonCash,
        transaction_count: payments.length,
      },
      methods_summary: methodsSummary,
      payments,
      session,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/reports/reconcile
reportRouter.post('/reconcile', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      date: z.string().default(() => new Date().toISOString().split('T')[0]),
      counted_cash: z.number().int().min(0, 'Counted cash must be non-negative'),
      notes: z.string().optional().default(''),
    });

    const data = schema.parse(req.body);
    const db = getDb();
    const cashierId = req.user!.id;

    // Calculate expected cash for the day
    const cashRow = await queryOne(`
      SELECT COALESCE(SUM(amount), 0) as expected_cash
      FROM fee_payments
      WHERE cashier_id = ? AND payment_date = ? AND payment_method = 'cash'
    `, [cashierId, data.date]);

    const expectedCash = Number(cashRow?.expected_cash || 0);
    const cashDifference = data.counted_cash - expectedCash; // 0 = balanced, <0 = shortage, >0 = surplus

    // Record or update cashier session
    const existing = await queryOne(`
      SELECT id FROM cashier_sessions WHERE cashier_id = ? AND date(opened_at) = ?
    `, [cashierId, data.date]);

    let sessionId: string;
    if (existing) {
      sessionId = existing.id;
      await db.execute({
        sql: `UPDATE cashier_sessions SET
          expected_cash = ?, counted_cash = ?, cash_difference = ?,
          status = 'reconciled', closed_at = CURRENT_TIMESTAMP, notes = ?
        WHERE id = ?`,
        args: [expectedCash, data.counted_cash, cashDifference, data.notes, sessionId],
      });
    } else {
      sessionId = `csess_${Date.now()}`;
      await db.execute({
        sql: `INSERT INTO cashier_sessions (
          id, cashier_id, workstation_id, opened_at, closed_at,
          opening_balance, expected_cash, counted_cash, cash_difference, status, notes
        ) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, ?, 'reconciled', ?)`,
        args: [
          sessionId, cashierId, req.workstationId || 'WS-MAIN',
          expectedCash, data.counted_cash, cashDifference, data.notes,
        ],
      });
    }

    await logAuditEvent({
      eventType: 'CASH_RECONCILIATION',
      actorId: req.user!.id,
      actorName: req.user!.username,
      role: req.user!.role,
      workstationId: req.workstationId!,
      targetTable: 'cashier_sessions',
      targetId: sessionId,
      action: 'RECONCILE_CASH',
      afterValue: {
        date: data.date,
        expected_cash: expectedCash,
        counted_cash: data.counted_cash,
        cash_difference: cashDifference,
      },
    });

    res.json({
      success: true,
      reconciliation: {
        session_id: sessionId,
        date: data.date,
        expected_cash: expectedCash,
        counted_cash: data.counted_cash,
        cash_difference: cashDifference,
        is_balanced: cashDifference === 0,
        status: 'reconciled',
      },
    });
  } catch (error) {
    next(error);
  }
});
