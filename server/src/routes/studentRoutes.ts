import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { queryOne, queryAll, getDb } from '../database/db.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission, requireRole } from '../middleware/rbac.js';
import { AppError } from '../middleware/errorHandler.js';
import { logAuditEvent } from '../middleware/audit.js';

export const studentRouter = Router();
studentRouter.use(authenticate);

// ==========================================
// 1. Student Directory / Search
// ==========================================

// GET /api/students
studentRouter.get('/', requirePermission('students:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { 
      search, 
      class_id, 
      session_id, 
      program_id,
      billing_plan,
      status, 
      limit = '50', 
      page = '1' 
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
    const offset = (pageNum - 1) * limitNum;
    const isFinancialUser = req.user!.role === 'admin' || req.user!.role === 'fee_manager';

    let whereClause = 'WHERE 1=1';
    const args: any[] = [];

    // If teacher, strictly restrict search scope to assigned classes
    if (req.user!.role === 'teacher') {
      const assigned = await queryAll(
        'SELECT class_id FROM teacher_classes WHERE teacher_id = ?',
        [req.user!.id]
      );
      if (assigned.length > 0) {
        const placeholders = assigned.map(() => '?').join(', ');
        whereClause += ` AND s.class_id IN (${placeholders})`;
        args.push(...assigned.map((a: any) => a.class_id));
      } else {
        whereClause += ' AND 1 = 0';
      }
    }

    if (search) {
      whereClause += ` AND (
        s.roll_number LIKE ? 
        OR s.full_name LIKE ? 
        OR s.father_name LIKE ? 
        OR s.guardian_phone LIKE ?
        OR c.name LIKE ?
        OR p.code LIKE ?
        OR p.name LIKE ?
      )`;
      const term = `%${search}%`;
      args.push(term, term, term, term, term, term, term);
    }

    if (class_id) {
      whereClause += ' AND s.class_id = ?';
      args.push(class_id);
    }

    if (session_id) {
      whereClause += ' AND s.academic_session_id = ?';
      args.push(session_id);
    }

    if (program_id) {
      whereClause += ' AND s.program_id = ?';
      args.push(program_id);
    }

    if (billing_plan && isFinancialUser) {
      whereClause += ' AND s.billing_plan = ?';
      args.push(billing_plan);
    }

    if (status) {
      whereClause += ' AND s.status = ?';
      args.push(status);
    }

    // Count query
    const countSql = `
      SELECT COUNT(*) as total 
      FROM students s
      JOIN classes c ON s.class_id = c.id
      JOIN programs p ON s.program_id = p.id
      ${whereClause}
    `;
    const countRes = await queryOne(countSql, args);
    const total = Number(countRes?.total || 0);

    // Main query
    const sql = `
      SELECT 
        s.id,
        s.roll_number,
        s.full_name,
        s.father_name,
        s.guardian_phone,
        s.address,
        s.program_id,
        s.class_id,
        s.academic_session_id,
        s.admission_date,
        s.status,
        s.notes,
        s.created_at,
        c.name as class_name,
        p.name as program_name,
        p.code as program_code,
        sess.name as session_name,
        ${isFinancialUser ? `
          s.billing_plan,
          COALESCE(fp.total_package_fee, s.total_package_fee) as agreed_package_fee,
          COALESCE(fp.standard_monthly_fee, 0) as standard_monthly_fee,
          COALESCE(fp.total_installments, 1) as total_installments,
          (
            SELECT COALESCE(SUM(pa.package_amount_credited), 0)
            FROM payment_allocations pa
            JOIN fee_payments pay ON pa.payment_id = pay.id
            WHERE pay.student_id = s.id
          ) as package_paid_to_date,
          (
            SELECT COALESCE(SUM(inv.remaining_invoice_balance), 0)
            FROM fee_invoices inv
            WHERE inv.student_id = s.id AND inv.status IN ('unpaid', 'partially_paid', 'overdue')
          ) as total_arrears_due
        ` : `
          NULL as billing_plan,
          NULL as agreed_package_fee,
          NULL as standard_monthly_fee,
          NULL as total_installments,
          NULL as package_paid_to_date,
          NULL as total_arrears_due
        `}
      FROM students s
      JOIN classes c ON s.class_id = c.id
      JOIN programs p ON s.program_id = p.id
      JOIN academic_sessions sess ON s.academic_session_id = sess.id
      LEFT JOIN student_fee_plans fp ON s.id = fp.student_id
      ${whereClause}
      ORDER BY s.roll_number ASC
      LIMIT ? OFFSET ?
    `;

    const students = await queryAll(sql, [...args, limitNum, offset]);

    res.json({
      success: true,
      students: students.map((std: any) => ({
        ...std,
        total_package_fee: isFinancialUser ? std.agreed_package_fee : undefined,
        remaining_package_balance: isFinancialUser
          ? Math.max(0, (std.agreed_package_fee || 0) - (std.package_paid_to_date || 0))
          : undefined,
      })),
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

// ==========================================
// 2. Student Lookup by Roll Number (Quick Cashier Lookup)
// ==========================================

// GET /api/students/lookup/:rollNumber
studentRouter.get('/lookup/:rollNumber', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rollNumber } = req.params;
    const cleanRoll = (rollNumber as string).trim();

    const student = await queryOne(`
      SELECT 
        s.*,
        c.name as class_name,
        p.name as program_name,
        p.code as program_code,
        sess.name as session_name,
        fp.billing_mode,
        fp.total_package_fee as plan_package_fee,
        fp.standard_monthly_fee,
        fp.total_installments,
        fp.approved_discount_type,
        fp.approved_discount_value,
        fp.default_due_day,
        (
          SELECT COALESCE(SUM(pa.package_amount_credited), 0)
          FROM payment_allocations pa
          JOIN fee_payments pay ON pa.payment_id = pay.id
          WHERE pay.student_id = s.id
        ) as package_paid_to_date,
        (
          SELECT COALESCE(SUM(inv.remaining_invoice_balance), 0)
          FROM fee_invoices inv
          WHERE inv.student_id = s.id AND inv.status IN ('unpaid', 'partially_paid', 'overdue')
        ) as total_arrears_due
      FROM students s
      JOIN classes c ON s.class_id = c.id
      JOIN programs p ON s.program_id = p.id
      JOIN academic_sessions sess ON s.academic_session_id = sess.id
      LEFT JOIN student_fee_plans fp ON s.id = fp.student_id
      WHERE s.roll_number = ?
    `, [cleanRoll]);

    if (!student) {
      throw new AppError(`Student with roll number '${cleanRoll}' not found`, 404, 'STUDENT_NOT_FOUND');
    }

    // Teacher Scoping: Verify assigned class and strip financial fields
    if (req.user!.role === 'teacher') {
      const assigned = await queryAll(
        'SELECT class_id FROM teacher_classes WHERE teacher_id = ?',
        [req.user!.id]
      );
      const isAllowed = assigned.length > 0 && assigned.some((a: any) => a.class_id === student.class_id);
      if (!isAllowed) {
        throw new AppError('Access denied: Student is not in your assigned class.', 403, 'OUT_OF_SCOPE');
      }

      return res.json({
        success: true,
        student: {
          id: student.id,
          roll_number: student.roll_number,
          full_name: student.full_name,
          father_name: student.father_name,
          guardian_phone: student.guardian_phone,
          address: student.address,
          program_id: student.program_id,
          class_id: student.class_id,
          academic_session_id: student.academic_session_id,
          class_name: student.class_name,
          program_name: student.program_name,
          program_code: student.program_code,
          session_name: student.session_name,
          status: student.status,
        },
      });
    }

    const packageFee = student.plan_package_fee ?? student.total_package_fee;
    const packagePaid = Number(student.package_paid_to_date || 0);
    const packageBalance = Math.max(0, packageFee - packagePaid);

    // Retrieve active unpaid invoices for this student
    const unpaidInvoices = await queryAll(`
      SELECT * FROM fee_invoices
      WHERE student_id = ? AND status IN ('unpaid', 'partially_paid', 'overdue')
      ORDER BY due_date ASC, created_at ASC
    `, [student.id]);

    res.json({
      success: true,
      student: {
        ...student,
        total_package_fee: packageFee,
        package_paid_to_date: packagePaid,
        remaining_package_balance: packageBalance,
      },
      unpaidInvoices,
    });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// 3. Student Admission (Minimal Entry)
// ==========================================

// POST /api/students/admit
studentRouter.post('/admit', requirePermission('students:create'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      roll_number: z.string().min(1, 'Roll number is required').trim(),
      full_name: z.string().min(1, 'Full name is required').trim(),
      father_name: z.string().min(1, 'Father/Guardian name is required').trim(),
      guardian_phone: z.string().min(1, 'Phone number is required').trim(),
      address: z.string().optional().default(''),
      program_id: z.string().min(1, 'Program is required'),
      class_id: z.string().min(1, 'Class is required'),
      academic_session_id: z.string().min(1, 'Academic session is required'),
      admission_date: z.string().default(() => new Date().toISOString().split('T')[0]),
      billing_plan: z.enum(['monthly', 'installment']).default('monthly'),
      total_package_fee: z.number().int().min(0, 'Package fee must be positive'),
      standard_monthly_fee: z.number().int().min(0).optional(),
      total_installments: z.number().int().min(1).optional().default(4),
      installments_schedule: z.array(z.object({
        installment_no: z.number().int(),
        amount: z.number().int().min(0),
        due_date: z.string(),
        label: z.string().optional(),
      })).optional(),
      scholarship_type: z.enum(['none', 'percentage', 'fixed']).default('none'),
      scholarship_value: z.number().int().min(0).default(0),
      notes: z.string().optional(),
    });

    const data = schema.parse(req.body);
    const db = getDb();

    // Check unique roll number
    const existing = await queryOne('SELECT id FROM students WHERE roll_number = ?', [data.roll_number]);
    if (existing) {
      throw new AppError(`Roll number '${data.roll_number}' is already registered`, 409, 'DUPLICATE_ROLL_NUMBER');
    }

    const studentId = `std_${Date.now()}`;
    const planId = `plan_${Date.now()}`;

    // Calculate standard monthly fee if monthly plan and not explicitly provided
    let monthlyFee = data.standard_monthly_fee;
    if (data.billing_plan === 'monthly' && (!monthlyFee || monthlyFee === 0)) {
      // Check default class fee
      const cls = await queryOne('SELECT default_monthly_fee FROM classes WHERE id = ?', [data.class_id]);
      monthlyFee = cls?.default_monthly_fee || Math.round(data.total_package_fee / 12);
    }

    // Insert student
    await db.execute({
      sql: `INSERT INTO students (
        id, roll_number, full_name, father_name, guardian_phone, address,
        program_id, class_id, academic_session_id, admission_date, billing_plan,
        total_package_fee, scholarship_type, scholarship_value, status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
      args: [
        studentId, data.roll_number, data.full_name, data.father_name, data.guardian_phone,
        data.address || '', data.program_id, data.class_id, data.academic_session_id,
        data.admission_date, data.billing_plan, data.total_package_fee,
        data.scholarship_type, data.scholarship_value, data.notes || '',
      ],
    });

    // Insert student fee plan
    await db.execute({
      sql: `INSERT INTO student_fee_plans (
        id, student_id, billing_mode, total_package_fee, standard_monthly_fee,
        total_installments, installments_schedule_json, approved_discount_type,
        approved_discount_value, start_date, default_due_day, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 10, 'active')`,
      args: [
        planId, studentId, data.billing_plan, data.total_package_fee, monthlyFee || 0,
        data.total_installments, data.installments_schedule ? JSON.stringify(data.installments_schedule) : null,
        data.scholarship_type, data.scholarship_value, data.admission_date,
      ],
    });

    await logAuditEvent({
      eventType: 'STUDENT_ADMISSION',
      actorId: req.user!.id,
      actorName: req.user!.username,
      role: req.user!.role,
      workstationId: req.workstationId!,
      targetTable: 'students',
      targetId: studentId,
      action: 'ADMIT_STUDENT',
      afterValue: { ...data, studentId },
    });

    const student = await queryOne(`
      SELECT s.*, c.name as class_name, p.name as program_name, sess.name as session_name
      FROM students s
      JOIN classes c ON s.class_id = c.id
      JOIN programs p ON s.program_id = p.id
      JOIN academic_sessions sess ON s.academic_session_id = sess.id
      WHERE s.id = ?
    `, [studentId]);

    res.status(201).json({ success: true, student });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// 4. Comprehensive Student Profile Workspace
// ==========================================

// GET /api/students/:id/profile
studentRouter.get('/:id/profile', requirePermission('students:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const isFinancialUser = req.user!.role === 'admin' || req.user!.role === 'fee_manager';
    const isAdmin = req.user!.role === 'admin';

    // 1. Fetch student identity and academic placement
    const student = await queryOne(`
      SELECT 
        s.*, 
        c.name as class_name, 
        c.section as class_section,
        p.name as program_name, 
        p.code as program_code, 
        p.duration_years,
        sess.name as session_name,
        sess.start_date as session_start_date,
        sess.end_date as session_end_date,
        fp.billing_mode as plan_billing_mode,
        fp.total_package_fee as plan_package_fee,
        fp.standard_monthly_fee,
        fp.total_installments,
        fp.installments_schedule_json,
        fp.approved_discount_type,
        fp.approved_discount_value,
        fp.default_due_day
      FROM students s
      JOIN classes c ON s.class_id = c.id
      JOIN programs p ON s.program_id = p.id
      JOIN academic_sessions sess ON s.academic_session_id = sess.id
      LEFT JOIN student_fee_plans fp ON s.id = fp.student_id
      WHERE s.id = ?
    `, [id]);

    if (!student) {
      throw new AppError('Student record not found.', 404, 'NOT_FOUND');
    }

    // 2. If teacher, verify academic scope
    if (req.user!.role === 'teacher') {
      const assigned = await queryAll(
        'SELECT class_id FROM teacher_classes WHERE teacher_id = ?',
        [req.user!.id]
      );
      const isAllowed = assigned.length > 0 && assigned.some((a: any) => a.class_id === student.class_id);
      if (!isAllowed) {
        throw new AppError('Access denied. This student is outside your assigned academic class scope.', 403, 'OUT_OF_SCOPE');
      }

      // Return academic workspace only for Teacher (no financial info)
      return res.json({
        success: true,
        student: {
          id: student.id,
          roll_number: student.roll_number,
          full_name: student.full_name,
          father_name: student.father_name,
          guardian_phone: student.guardian_phone,
          address: student.address,
          admission_date: student.admission_date,
          status: student.status,
          notes: student.notes,
        },
        academic: {
          program_name: student.program_name,
          program_code: student.program_code,
          duration_years: student.duration_years,
          class_name: student.class_name,
          class_section: student.class_section,
          session_name: student.session_name,
          session_start_date: student.session_start_date,
          session_end_date: student.session_end_date,
        },
      });
    }

    // 3. For Financial Roles (Admin & Fee Manager):
    // Invoices / Challans
    const invoices = await queryAll(`
      SELECT * FROM fee_invoices 
      WHERE student_id = ? 
      ORDER BY issue_date DESC, created_at DESC
    `, [id]);

    // Payments & Receipts
    const payments = await queryAll(`
      SELECT p.*, inv.challan_no, u.username as cashier_username, u.full_name as cashier_name
      FROM fee_payments p
      JOIN fee_invoices inv ON p.invoice_id = inv.id
      JOIN users u ON p.cashier_id = u.id
      WHERE p.student_id = ?
      ORDER BY p.payment_date DESC, p.created_at DESC
    `, [id]);

    // Adjustments & Scholarships
    const adjustments = await queryAll(`
      SELECT a.*, u.username as authorized_by_name
      FROM fee_adjustments a
      JOIN users u ON a.authorized_by = u.id
      WHERE a.student_id = ?
      ORDER BY a.created_at DESC
    `, [id]);

    // Financial Metrics Calculation
    const agreedPackage = student.plan_package_fee ?? student.total_package_fee;
    const totalPaymentsReceived = payments.reduce((acc, p) => acc + Number(p.amount), 0);
    const remainingPackageBalance = Math.max(0, agreedPackage - totalPaymentsReceived);
    const currentBillingPlan = student.plan_billing_mode || student.billing_plan;
    const currentCycleAmount = currentBillingPlan === 'monthly'
      ? (student.standard_monthly_fee || 0)
      : Math.round(agreedPackage / (student.total_installments || 1));

    // Outstanding invoices
    const unpaidInvoices = invoices.filter((inv) => ['unpaid', 'partially_paid', 'overdue'].includes(inv.status));
    const totalOutstandingInvoices = unpaidInvoices.reduce((acc, inv) => acc + Number(inv.remaining_invoice_balance), 0);
    const latestUnpaid = unpaidInvoices[0];
    const currentInvoiceDue = latestUnpaid ? Number(latestUnpaid.remaining_invoice_balance) : 0;
    const totalArrears = unpaidInvoices
      .filter((inv) => new Date(inv.due_date) < new Date())
      .reduce((acc, inv) => acc + Number(inv.remaining_invoice_balance), 0);

    const nextDueDate = latestUnpaid ? latestUnpaid.due_date : null;

    let scholarshipSummary = 'None';
    if (student.approved_discount_type === 'percentage') {
      scholarshipSummary = `${student.approved_discount_value}% Merit Concession`;
    } else if (student.approved_discount_type === 'fixed') {
      scholarshipSummary = `Rs. ${Number(student.approved_discount_value).toLocaleString()} Fixed Concession`;
    }

    // 4. Chronological Student Fee Ledger
    // Combine invoices (charges), adjustments, and payments into a ledger
    type LedgerEntry = {
      date: string;
      type: 'INVOICE_CHARGE' | 'PAYMENT' | 'ADJUSTMENT';
      reference: string;
      description: string;
      debit: number;
      credit: number;
      running_balance: number;
    };

    const rawEvents: Array<{
      date: string;
      type: 'INVOICE_CHARGE' | 'PAYMENT' | 'ADJUSTMENT';
      reference: string;
      description: string;
      debit: number;
      credit: number;
      createdAt: string;
    }> = [];

    for (const inv of invoices) {
      rawEvents.push({
        date: inv.issue_date,
        type: 'INVOICE_CHARGE',
        reference: inv.challan_no,
        description: `Challan Fee (${inv.billing_period})`,
        debit: Number(inv.net_payable),
        credit: 0,
        createdAt: inv.created_at,
      });
    }

    for (const p of payments) {
      rawEvents.push({
        date: p.payment_date,
        type: 'PAYMENT',
        reference: p.receipt_no,
        description: `Fee Payment (${p.payment_method.toUpperCase()}) - ${p.challan_no}`,
        debit: 0,
        credit: Number(p.amount),
        createdAt: p.created_at,
      });
    }

    for (const adj of adjustments) {
      const isDebit = ['fine'].includes(adj.adjustment_type);
      rawEvents.push({
        date: adj.created_at.split(' ')[0] || adj.created_at,
        type: 'ADJUSTMENT',
        reference: adj.id,
        description: `${adj.adjustment_type.toUpperCase()}: ${adj.reason}`,
        debit: isDebit ? Math.abs(Number(adj.amount)) : 0,
        credit: !isDebit ? Math.abs(Number(adj.amount)) : 0,
        createdAt: adj.created_at,
      });
    }

    // Sort ascending by date and created_at
    rawEvents.sort((a, b) => {
      const dateCmp = a.date.localeCompare(b.date);
      if (dateCmp !== 0) return dateCmp;
      return a.createdAt.localeCompare(b.createdAt);
    });

    let runningBalance = 0;
    const ledger: LedgerEntry[] = rawEvents.map((evt) => {
      runningBalance += (evt.debit - evt.credit);
      return {
        date: evt.date,
        type: evt.type,
        reference: evt.reference,
        description: evt.description,
        debit: evt.debit,
        credit: evt.credit,
        running_balance: runningBalance,
      };
    });

    // 5. Activity and Audit Logs (if Admin)
    let auditActivity: any[] = [];
    if (isAdmin) {
      auditActivity = await queryAll(`
        SELECT * FROM audit_logs 
        WHERE (target_table = 'students' AND target_id = ?)
           OR (target_table IN ('fee_invoices', 'fee_payments') AND target_id IN (
              SELECT id FROM fee_invoices WHERE student_id = ?
              UNION
              SELECT id FROM fee_payments WHERE student_id = ?
           ))
        ORDER BY created_at DESC LIMIT 25
      `, [id, id, id]);
    }

    res.json({
      success: true,
      student,
      academic: {
        program_name: student.program_name,
        program_code: student.program_code,
        duration_years: student.duration_years,
        class_name: student.class_name,
        class_section: student.class_section,
        session_name: student.session_name,
        session_start_date: student.session_start_date,
        session_end_date: student.session_end_date,
      },
      fee_overview: {
        total_agreed_package_fee: agreedPackage,
        total_qualifying_package_payments: totalPaymentsReceived,
        remaining_package_balance: remainingPackageBalance,
        current_billing_plan: currentBillingPlan,
        current_cycle_amount: currentCycleAmount,
        current_invoice_amount_due: currentInvoiceDue,
        total_outstanding_invoice_balance: totalOutstandingInvoices,
        total_arrears: totalArrears,
        next_eligible_due_date: nextDueDate,
        scholarship_summary: scholarshipSummary,
      },
      challans: invoices,
      payments,
      ledger,
      audit_activity: auditActivity,
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/students/:id (Update Student Profile)
studentRouter.put('/:id', requirePermission('students:update'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const schema = z.object({
      full_name: z.string().min(1, 'Full name is required'),
      father_name: z.string().min(1, 'Father name is required'),
      guardian_phone: z.string().min(1, 'Phone is required'),
      address: z.string().optional().default(''),
      class_id: z.string().optional(),
      status: z.enum(['active', 'graduated', 'suspended', 'withdrawn', 'struck_off']).default('active'),
      notes: z.string().optional(),
    });

    const data = schema.parse(req.body);
    const before = await queryOne('SELECT * FROM students WHERE id = ?', [id]);
    if (!before) {
      throw new AppError('Student not found', 404, 'NOT_FOUND');
    }

    const db = getDb();
    const newClassId = data.class_id || before.class_id;

    await db.execute({
      sql: `UPDATE students SET
        full_name = ?,
        father_name = ?,
        guardian_phone = ?,
        address = ?,
        class_id = ?,
        status = ?,
        notes = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
      args: [
        data.full_name,
        data.father_name,
        data.guardian_phone,
        data.address || '',
        newClassId,
        data.status,
        data.notes || '',
        id,
      ],
    });

    await logAuditEvent({
      eventType: 'STUDENT_PROFILE_UPDATED',
      actorId: req.user!.id,
      actorName: req.user!.username,
      role: req.user!.role,
      workstationId: req.workstationId!,
      targetTable: 'students',
      targetId: id as string,
      action: 'UPDATE_STUDENT_PROFILE',
      beforeValue: before,
      afterValue: { ...data, class_id: newClassId },
    });

    const updated = await queryOne(`
      SELECT s.*, c.name as class_name, p.name as program_name, sess.name as session_name
      FROM students s
      JOIN classes c ON s.class_id = c.id
      JOIN programs p ON s.program_id = p.id
      JOIN academic_sessions sess ON s.academic_session_id = sess.id
      WHERE s.id = ?
    `, [id]);

    res.json({ success: true, student: updated });
  } catch (error) {
    next(error);
  }
});

// GET /api/students/:id/ledger (Restricted strictly to Financial Roles: Admin, Fee Manager)
studentRouter.get('/:id/ledger', requireRole('admin', 'fee_manager'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const student = await queryOne(`
      SELECT s.*, c.name as class_name, p.name as program_name, sess.name as session_name,
             fp.billing_mode, fp.standard_monthly_fee, fp.total_installments, fp.installments_schedule_json
      FROM students s
      JOIN classes c ON s.class_id = c.id
      JOIN programs p ON s.program_id = p.id
      JOIN academic_sessions sess ON s.academic_session_id = sess.id
      LEFT JOIN student_fee_plans fp ON s.id = fp.student_id
      WHERE s.id = ?
    `, [id]);

    if (!student) {
      throw new AppError('Student not found', 404, 'NOT_FOUND');
    }

    // Invoices
    const invoices = await queryAll(`
      SELECT * FROM fee_invoices WHERE student_id = ? ORDER BY issue_date DESC, created_at DESC
    `, [id]);

    // Payments & Receipts
    const payments = await queryAll(`
      SELECT p.*, inv.challan_no, u.username as cashier_username
      FROM fee_payments p
      JOIN fee_invoices inv ON p.invoice_id = inv.id
      JOIN users u ON p.cashier_id = u.id
      WHERE p.student_id = ?
      ORDER BY p.payment_date DESC, p.created_at DESC
    `, [id]);

    // Adjustments
    const adjustments = await queryAll(`
      SELECT a.*, u.username as authorized_by_name
      FROM fee_adjustments a
      JOIN users u ON a.authorized_by = u.id
      WHERE a.student_id = ?
      ORDER BY a.created_at DESC
    `, [id]);

    // Calculate totals
    const totalPackage = student.total_package_fee;
    const totalPaid = payments.reduce((acc, p) => acc + Number(p.amount), 0);
    const totalBilled = invoices.reduce((acc, inv) => acc + Number(inv.net_payable), 0);
    const totalOutstandingInvoices = invoices.reduce((acc, inv) => acc + Number(inv.remaining_invoice_balance), 0);
    const remainingPackageBalance = Math.max(0, totalPackage - totalPaid);

    res.json({
      success: true,
      student,
      summary: {
        total_package_fee: totalPackage,
        total_package_paid: totalPaid,
        remaining_package_balance: remainingPackageBalance,
        total_invoices_billed: totalBilled,
        total_outstanding_arrears: totalOutstandingInvoices,
      },
      invoices,
      payments,
      adjustments,
    });
  } catch (error) {
    next(error);
  }
});
