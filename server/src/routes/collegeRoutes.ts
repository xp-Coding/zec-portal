import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { queryOne, queryAll, getDb } from '../database/db.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { AppError } from '../middleware/errorHandler.js';
import { logAuditEvent } from '../middleware/audit.js';

export const collegeRouter = Router();

// Apply authentication to all college management routes
collegeRouter.use(authenticate);

// ==========================================
// 1. College Settings
// ==========================================

// GET /api/college/settings
collegeRouter.get('/settings', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await queryOne('SELECT * FROM college_settings LIMIT 1');
    res.json({ success: true, settings });
  } catch (error) {
    next(error);
  }
});

// PUT /api/college/settings (Admin only)
collegeRouter.put('/settings', requirePermission('college:manage_settings'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      college_name: z.string().min(1),
      college_short_name: z.string().min(1),
      address: z.string().min(1),
      phone: z.string().min(1),
      email: z.string().email(),
      website: z.string().optional(),
      bank_name: z.string().min(1),
      bank_branch: z.string().min(1),
      bank_account_title: z.string().min(1),
      bank_account_no: z.string().min(1),
      bank_iban: z.string().optional(),
      payment_instructions: z.string().min(1),
      currency: z.string().default('PKR'),
      default_due_day: z.number().int().min(1).max(31).default(10),
      late_fine_per_day: z.number().int().min(0).default(20),
      timezone: z.string().default('Asia/Karachi'),
    });

    const data = schema.parse(req.body);
    const db = getDb();

    const before = await queryOne('SELECT * FROM college_settings LIMIT 1');

    await db.execute({
      sql: `UPDATE college_settings SET
        college_name = ?, college_short_name = ?, address = ?, phone = ?, email = ?, website = ?,
        bank_name = ?, bank_branch = ?, bank_account_title = ?, bank_account_no = ?, bank_iban = ?,
        payment_instructions = ?, currency = ?, default_due_day = ?, late_fine_per_day = ?, timezone = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
      args: [
        data.college_name, data.college_short_name, data.address, data.phone, data.email, data.website || '',
        data.bank_name, data.bank_branch, data.bank_account_title, data.bank_account_no, data.bank_iban || '',
        data.payment_instructions, data.currency, data.default_due_day, data.late_fine_per_day, data.timezone,
        before.id,
      ],
    });

    await logAuditEvent({
      eventType: 'SETTINGS_UPDATE',
      actorId: req.user!.id,
      actorName: req.user!.username,
      role: req.user!.role,
      workstationId: req.workstationId!,
      targetTable: 'college_settings',
      targetId: before.id,
      action: 'UPDATE_SETTINGS',
      beforeValue: before,
      afterValue: data,
    });

    const updated = await queryOne('SELECT * FROM college_settings WHERE id = ?', [before.id]);
    res.json({ success: true, settings: updated });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// 2. Academic Sessions
// ==========================================

// GET /api/college/sessions
collegeRouter.get('/sessions', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const sessions = await queryAll('SELECT * FROM academic_sessions ORDER BY start_date DESC');
    res.json({ success: true, sessions });
  } catch (error) {
    next(error);
  }
});

// POST /api/college/sessions
collegeRouter.post('/sessions', requirePermission('academic:manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      name: z.string().min(1, 'Session name is required'),
      start_date: z.string().min(1, 'Start date is required'),
      end_date: z.string().min(1, 'End date is required'),
      is_active: z.boolean().default(false),
      status: z.enum(['active', 'archived', 'upcoming']).default('active'),
    });

    const data = schema.parse(req.body);

    if (new Date(data.start_date) >= new Date(data.end_date)) {
      throw new AppError('Start date must be earlier than end date.', 400, 'INVALID_DATE_RANGE');
    }

    const existing = await queryOne('SELECT id FROM academic_sessions WHERE name = ?', [data.name]);
    if (existing) {
      throw new AppError(`Academic session '${data.name}' already exists.`, 409, 'DUPLICATE_SESSION');
    }

    const db = getDb();
    const id = `sess_${Date.now()}`;

    if (data.is_active) {
      await db.execute('UPDATE academic_sessions SET is_active = 0');
    }

    await db.execute({
      sql: `INSERT INTO academic_sessions (id, name, start_date, end_date, is_active, status)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [id, data.name, data.start_date, data.end_date, data.is_active ? 1 : 0, data.status],
    });

    await logAuditEvent({
      eventType: 'ACADEMIC_SESSION_CREATED',
      actorId: req.user!.id,
      actorName: req.user!.username,
      role: req.user!.role,
      workstationId: req.workstationId!,
      targetTable: 'academic_sessions',
      targetId: id,
      action: 'CREATE_SESSION',
      afterValue: data,
    });

    const created = await queryOne('SELECT * FROM academic_sessions WHERE id = ?', [id]);
    res.json({ success: true, session: created });
  } catch (error) {
    next(error);
  }
});

// PUT /api/college/sessions/:id
collegeRouter.put('/sessions/:id', requirePermission('academic:manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const schema = z.object({
      name: z.string().min(1),
      start_date: z.string().min(1),
      end_date: z.string().min(1),
      status: z.enum(['active', 'archived', 'upcoming']),
    });

    const data = schema.parse(req.body);

    if (new Date(data.start_date) >= new Date(data.end_date)) {
      throw new AppError('Start date must be earlier than end date.', 400, 'INVALID_DATE_RANGE');
    }

    const duplicate = await queryOne('SELECT id FROM academic_sessions WHERE name = ? AND id != ?', [data.name, id]);
    if (duplicate) {
      throw new AppError(`Academic session '${data.name}' already exists.`, 409, 'DUPLICATE_SESSION');
    }

    const before = await queryOne('SELECT * FROM academic_sessions WHERE id = ?', [id]);
    if (!before) {
      throw new AppError('Academic session not found', 404, 'NOT_FOUND');
    }

    const db = getDb();
    await db.execute({
      sql: `UPDATE academic_sessions SET name = ?, start_date = ?, end_date = ?, status = ? WHERE id = ?`,
      args: [data.name, data.start_date, data.end_date, data.status, id as string],
    });

    await logAuditEvent({
      eventType: 'ACADEMIC_SESSION_UPDATED',
      actorId: req.user!.id,
      actorName: req.user!.username,
      role: req.user!.role,
      workstationId: req.workstationId!,
      targetTable: 'academic_sessions',
      targetId: id as string,
      action: 'UPDATE_SESSION',
      beforeValue: before,
      afterValue: data,
    });

    const updated = await queryOne('SELECT * FROM academic_sessions WHERE id = ?', [id]);
    res.json({ success: true, session: updated });
  } catch (error) {
    next(error);
  }
});

// PUT /api/college/sessions/:id/activate
collegeRouter.put('/sessions/:id/activate', requirePermission('academic:manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const db = getDb();
    await db.execute('UPDATE academic_sessions SET is_active = 0');
    await db.execute({ sql: "UPDATE academic_sessions SET is_active = 1, status = 'active' WHERE id = ?", args: [id as string] });
    
    await logAuditEvent({
      eventType: 'ACADEMIC_SESSION_ACTIVATED',
      actorId: req.user!.id,
      actorName: req.user!.username,
      role: req.user!.role,
      workstationId: req.workstationId!,
      targetTable: 'academic_sessions',
      targetId: id as string,
      action: 'ACTIVATE_SESSION',
    });

    const active = await queryOne('SELECT * FROM academic_sessions WHERE id = ?', [id]);
    res.json({ success: true, session: active });
  } catch (error) {
    next(error);
  }
});

// PUT /api/college/sessions/:id/archive
collegeRouter.put('/sessions/:id/archive', requirePermission('academic:manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const db = getDb();
    await db.execute({ sql: "UPDATE academic_sessions SET is_active = 0, status = 'archived' WHERE id = ?", args: [id as string] });
    
    await logAuditEvent({
      eventType: 'ACADEMIC_SESSION_ARCHIVED',
      actorId: req.user!.id,
      actorName: req.user!.username,
      role: req.user!.role,
      workstationId: req.workstationId!,
      targetTable: 'academic_sessions',
      targetId: id as string,
      action: 'ARCHIVE_SESSION',
    });

    const archived = await queryOne('SELECT * FROM academic_sessions WHERE id = ?', [id]);
    res.json({ success: true, session: archived });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/college/sessions/:id
collegeRouter.delete('/sessions/:id', requirePermission('academic:manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    
    // Check if session contains student or financial records
    const studentCount = await queryOne('SELECT COUNT(*) as count FROM students WHERE academic_session_id = ?', [id]);
    const invoiceCount = await queryOne('SELECT COUNT(*) as count FROM fee_invoices WHERE academic_session_id = ?', [id]);

    if (Number(studentCount?.count || 0) > 0 || Number(invoiceCount?.count || 0) > 0) {
      throw new AppError(
        'Cannot physically delete an academic session that contains student records, invoices, or historical transactions. Please archive the session instead to preserve historical integrity.',
        400,
        'CANNOT_DELETE_ACTIVE_SESSION'
      );
    }

    const db = getDb();
    await db.execute({ sql: 'DELETE FROM academic_sessions WHERE id = ?', args: [id as string] });

    await logAuditEvent({
      eventType: 'ACADEMIC_SESSION_DELETED',
      actorId: req.user!.id,
      actorName: req.user!.username,
      role: req.user!.role,
      workstationId: req.workstationId!,
      targetTable: 'academic_sessions',
      targetId: id as string,
      action: 'DELETE_SESSION',
    });

    res.json({ success: true, message: 'Academic session deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// 3. Programs
// ==========================================

// GET /api/college/programs
collegeRouter.get('/programs', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const programs = await queryAll('SELECT * FROM programs ORDER BY name ASC');
    res.json({ success: true, programs });
  } catch (error) {
    next(error);
  }
});

// POST /api/college/programs
collegeRouter.post('/programs', requirePermission('academic:manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      name: z.string().min(1),
      code: z.string().min(1).toUpperCase(),
      description: z.string().optional(),
      duration_years: z.number().int().min(1).max(5).default(2),
      status: z.enum(['active', 'inactive']).default('active'),
    });

    const data = schema.parse(req.body);
    const db = getDb();
    const id = `prog_${Date.now()}`;

    await db.execute({
      sql: `INSERT INTO programs (id, name, code, description, duration_years, status)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [id, data.name, data.code, data.description || '', data.duration_years, data.status],
    });

    const created = await queryOne('SELECT * FROM programs WHERE id = ?', [id]);
    res.json({ success: true, program: created });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// 4. Classes
// ==========================================

// GET /api/college/classes
collegeRouter.get('/classes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { session_id, program_id, status } = req.query;
    let sql = `
      SELECT 
        c.*, 
        p.name as program_name, 
        p.code as program_code, 
        s.name as session_name,
        (SELECT COUNT(*) FROM students std WHERE std.class_id = c.id AND std.status = 'active') as student_count,
        (SELECT COUNT(*) FROM students std WHERE std.class_id = c.id) as total_student_count
      FROM classes c
      JOIN programs p ON c.program_id = p.id
      JOIN academic_sessions s ON c.academic_session_id = s.id
      WHERE 1=1
    `;
    const args: any[] = [];

    // If teacher, filter to assigned classes
    if (req.user!.role === 'teacher') {
      const assigned = await queryAll(
        'SELECT class_id FROM teacher_classes WHERE teacher_id = ?',
        [req.user!.id]
      );
      if (assigned.length > 0) {
        const placeholders = assigned.map(() => '?').join(', ');
        sql += ` AND c.id IN (${placeholders})`;
        args.push(...assigned.map((a: any) => a.class_id));
      } else {
        sql += ' AND 1 = 0';
      }
    }

    if (session_id) {
      sql += ' AND c.academic_session_id = ?';
      args.push(session_id);
    }
    if (program_id) {
      sql += ' AND c.program_id = ?';
      args.push(program_id);
    }
    if (status) {
      sql += ' AND c.status = ?';
      args.push(status);
    }

    sql += ' ORDER BY s.name DESC, p.name ASC, c.name ASC';

    const classes = await queryAll(sql, args);
    res.json({ success: true, classes });
  } catch (error) {
    next(error);
  }
});

// GET /api/college/classes/:id (Class details + financial summary + student directory + fee configuration)
collegeRouter.get('/classes/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    // Strict Teacher class isolation check
    if (req.user!.role === 'teacher') {
      const isAssigned = await queryOne(
        'SELECT id FROM teacher_classes WHERE teacher_id = ? AND class_id = ?',
        [req.user!.id, id]
      );
      if (!isAssigned) {
        throw new AppError('Access denied: You are not assigned to this class', 403, 'TEACHER_CLASS_ACCESS_DENIED');
      }
    }

    const classInfo = await queryOne(`
      SELECT 
        c.*, 
        p.name as program_name, 
        p.code as program_code, 
        s.name as session_name,
        (SELECT COUNT(*) FROM students std WHERE std.class_id = c.id AND std.status = 'active') as student_count,
        (SELECT COUNT(*) FROM students std WHERE std.class_id = c.id) as total_student_count
      FROM classes c
      JOIN programs p ON c.program_id = p.id
      JOIN academic_sessions s ON c.academic_session_id = s.id
      WHERE c.id = ?
    `, [id]);

    if (!classInfo) {
      throw new AppError('Class not found', 404, 'NOT_FOUND');
    }

    const isFinancialUser = req.user!.role === 'admin' || req.user!.role === 'fee_manager';

    let students: any[] = [];
    let financialSummary: any = null;

    if (isFinancialUser) {
      // Query students with financial metrics in a single optimized query
      const rawStudents = await queryAll(`
        SELECT 
          s.id,
          s.roll_number,
          s.full_name,
          s.father_name,
          s.guardian_phone,
          s.admission_date,
          s.status,
          s.billing_plan,
          COALESCE(fp.total_package_fee, s.total_package_fee, 0) as agreed_package_fee,
          COALESCE(fp.standard_monthly_fee, 0) as standard_monthly_fee,
          CASE WHEN fp.id IS NOT NULL OR s.total_package_fee > 0 THEN 1 ELSE 0 END as has_fee_plan,
          (
            SELECT COALESCE(SUM(pa.package_amount_credited), 0)
            FROM payment_allocations pa
            JOIN fee_payments pay ON pa.payment_id = pay.id
            WHERE pay.student_id = s.id AND (pay.is_reversed IS NULL OR pay.is_reversed = 0)
          ) as amount_paid,
          (
            SELECT inv.remaining_invoice_balance
            FROM fee_invoices inv
            WHERE inv.student_id = s.id AND inv.status IN ('unpaid', 'partially_paid', 'overdue')
            ORDER BY inv.issue_date DESC LIMIT 1
          ) as current_invoice_balance,
          (
            SELECT inv.net_payable
            FROM fee_invoices inv
            WHERE inv.student_id = s.id AND inv.status IN ('unpaid', 'partially_paid', 'overdue')
            ORDER BY inv.issue_date DESC LIMIT 1
          ) as current_invoice_amount,
          (
            SELECT inv.due_date
            FROM fee_invoices inv
            WHERE inv.student_id = s.id AND inv.status IN ('unpaid', 'partially_paid', 'overdue')
            ORDER BY inv.issue_date DESC LIMIT 1
          ) as current_invoice_due_date,
          (
            SELECT inv.challan_no
            FROM fee_invoices inv
            WHERE inv.student_id = s.id
            ORDER BY inv.created_at DESC LIMIT 1
          ) as latest_challan_no,
          (
            SELECT COUNT(*)
            FROM fee_invoices inv
            WHERE inv.student_id = s.id 
              AND inv.status IN ('unpaid', 'partially_paid', 'overdue')
              AND date(inv.due_date) < date('now')
          ) as overdue_invoices_count
        FROM students s
        LEFT JOIN student_fee_plans fp ON s.id = fp.student_id
        WHERE s.class_id = ?
        ORDER BY s.roll_number ASC
      `, [id]);

      students = rawStudents.map((std: any) => {
        const agreedFee = Number(std.agreed_package_fee || 0);
        const paid = Number(std.amount_paid || 0);
        const remaining = Math.max(0, agreedFee - paid);
        const hasPlan = Boolean(std.has_fee_plan === 1);
        const overdueCount = Number(std.overdue_invoices_count || 0);
        const currentInvBal = std.current_invoice_balance !== null ? Number(std.current_invoice_balance) : null;
        const currentInvAmt = std.current_invoice_amount !== null ? Number(std.current_invoice_amount) : null;

        let paymentStatus: 'paid' | 'partially_paid' | 'unpaid' | 'overdue' | 'review_required' = 'unpaid';
        if (!hasPlan && agreedFee === 0) {
          paymentStatus = 'review_required';
        } else if (overdueCount > 0) {
          paymentStatus = 'overdue';
        } else if (remaining === 0 && (paid > 0 || agreedFee > 0)) {
          paymentStatus = 'paid';
        } else if (paid > 0 && remaining > 0) {
          paymentStatus = 'partially_paid';
        } else {
          paymentStatus = 'unpaid';
        }

        return {
          id: std.id,
          roll_number: std.roll_number,
          full_name: std.full_name,
          father_name: std.father_name,
          guardian_phone: std.guardian_phone,
          admission_date: std.admission_date,
          billing_plan: std.billing_plan,
          status: std.status,
          agreed_package_fee: agreedFee,
          amount_paid: paid,
          remaining_balance: remaining,
          current_invoice_amount: currentInvAmt,
          current_invoice_balance: currentInvBal,
          current_invoice_due_date: std.current_invoice_due_date,
          latest_challan_no: std.latest_challan_no,
          has_fee_plan: hasPlan,
          payment_status: paymentStatus,
        };
      });

      const totalAgreedFee = students.reduce((acc, s) => acc + s.agreed_package_fee, 0);
      const totalCollected = students.reduce((acc, s) => acc + s.amount_paid, 0);
      const totalRemaining = Math.max(0, totalAgreedFee - totalCollected);
      const studentsWithBalance = students.filter((s) => s.remaining_balance > 0).length;
      const studentsFullyPaid = students.filter((s) => s.payment_status === 'paid').length;
      const studentsOverdue = students.filter((s) => s.payment_status === 'overdue').length;
      const studentsReviewRequired = students.filter((s) => s.payment_status === 'review_required').length;

      financialSummary = {
        total_enrolled: students.length,
        total_agreed_fee: totalAgreedFee,
        total_collected: totalCollected,
        total_remaining_balance: totalRemaining,
        students_with_balance: studentsWithBalance,
        students_fully_paid: studentsFullyPaid,
        students_overdue: studentsOverdue,
        students_review_required: studentsReviewRequired,
      };
    } else {
      // Teacher: strictly non-financial roster only
      const rawStudents = await queryAll(`
        SELECT id, roll_number, full_name, father_name, guardian_phone, admission_date, status
        FROM students
        WHERE class_id = ?
        ORDER BY roll_number ASC
      `, [id]);

      students = rawStudents.map((std: any) => ({
        id: std.id,
        roll_number: std.roll_number,
        full_name: std.full_name,
        father_name: std.father_name,
        guardian_phone: std.guardian_phone,
        admission_date: std.admission_date,
        status: std.status,
      }));
      financialSummary = null;
    }

    // Fee structures applicable to this class (for financial users only)
    const feeStructures = isFinancialUser ? await queryAll(`
      SELECT * FROM fee_structures
      WHERE (class_id = ? OR (class_id IS NULL AND program_id = ?))
        AND academic_session_id = ?
      ORDER BY fee_head ASC
    `, [id, classInfo.program_id, classInfo.academic_session_id]) : [];

    res.json({
      success: true,
      class: classInfo,
      financial_summary: financialSummary,
      students,
      feeStructures,
    });

  } catch (error) {
    next(error);
  }
});

// POST /api/college/classes
collegeRouter.post('/classes', requirePermission('academic:manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      name: z.string().min(1, 'Class name is required'),
      program_id: z.string().min(1, 'Program is required'),
      academic_session_id: z.string().min(1, 'Academic session is required'),
      section: z.string().default('A'),
      default_monthly_fee: z.number().int().min(0).default(0),
      status: z.enum(['active', 'inactive']).default('active'),
    });

    const data = schema.parse(req.body);
    const db = getDb();

    // Check duplicate class name in same session and program
    const duplicate = await queryOne(
      'SELECT id FROM classes WHERE name = ? AND program_id = ? AND academic_session_id = ?',
      [data.name, data.program_id, data.academic_session_id]
    );
    if (duplicate) {
      throw new AppError(`A class named '${data.name}' already exists in this program and session.`, 409, 'DUPLICATE_CLASS');
    }

    const id = `class_${Date.now()}`;

    await db.execute({
      sql: `INSERT INTO classes (id, name, program_id, academic_session_id, section, default_monthly_fee, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [id, data.name, data.program_id, data.academic_session_id, data.section, data.default_monthly_fee, data.status],
    });

    await logAuditEvent({
      eventType: 'CLASS_CREATED',
      actorId: req.user!.id,
      actorName: req.user!.username,
      role: req.user!.role,
      workstationId: req.workstationId!,
      targetTable: 'classes',
      targetId: id,
      action: 'CREATE_CLASS',
      afterValue: data,
    });

    const created = await queryOne(`
      SELECT c.*, p.name as program_name, p.code as program_code, s.name as session_name,
             0 as student_count, 0 as total_student_count
      FROM classes c
      JOIN programs p ON c.program_id = p.id
      JOIN academic_sessions s ON c.academic_session_id = s.id
      WHERE c.id = ?
    `, [id]);

    res.json({ success: true, class: created });
  } catch (error) {
    next(error);
  }
});

// PUT /api/college/classes/:id (Edit class)
collegeRouter.put('/classes/:id', requirePermission('academic:manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const schema = z.object({
      name: z.string().min(1),
      section: z.string().default('A'),
      default_monthly_fee: z.number().int().min(0).default(0),
      status: z.enum(['active', 'inactive']).default('active'),
    });

    const data = schema.parse(req.body);
    const db = getDb();

    const before = await queryOne('SELECT * FROM classes WHERE id = ?', [id]);
    if (!before) {
      throw new AppError('Class not found', 404, 'NOT_FOUND');
    }

    await db.execute({
      sql: `UPDATE classes SET name = ?, section = ?, default_monthly_fee = ?, status = ? WHERE id = ?`,
      args: [data.name, data.section, data.default_monthly_fee, data.status, id as string],
    });

    await logAuditEvent({
      eventType: 'CLASS_UPDATED',
      actorId: req.user!.id,
      actorName: req.user!.username,
      role: req.user!.role,
      workstationId: req.workstationId!,
      targetTable: 'classes',
      targetId: id as string,
      action: 'UPDATE_CLASS',
      beforeValue: before,
      afterValue: data,
    });

    const updated = await queryOne(`
      SELECT c.*, p.name as program_name, p.code as program_code, s.name as session_name,
        (SELECT COUNT(*) FROM students std WHERE std.class_id = c.id AND std.status = 'active') as student_count,
        (SELECT COUNT(*) FROM students std WHERE std.class_id = c.id) as total_student_count
      FROM classes c
      JOIN programs p ON c.program_id = p.id
      JOIN academic_sessions s ON c.academic_session_id = s.id
      WHERE c.id = ?
    `, [id]);

    res.json({ success: true, class: updated });
  } catch (error) {
    next(error);
  }
});

// PUT /api/college/classes/:id/status (Archive / Deactivate)
collegeRouter.put('/classes/:id/status', requirePermission('academic:manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { status } = z.object({ status: z.enum(['active', 'inactive']) }).parse(req.body);
    const db = getDb();

    await db.execute({ sql: 'UPDATE classes SET status = ? WHERE id = ?', args: [status, id as string] });

    await logAuditEvent({
      eventType: 'CLASS_STATUS_UPDATED',
      actorId: req.user!.id,
      actorName: req.user!.username,
      role: req.user!.role,
      workstationId: req.workstationId!,
      targetTable: 'classes',
      targetId: id as string,
      action: status === 'active' ? 'ACTIVATE_CLASS' : 'DEACTIVATE_CLASS',
    });

    res.json({ success: true, message: `Class status updated to ${status}` });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// 5. Workstations
// ==========================================

// GET /api/college/workstations
collegeRouter.get('/workstations', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const workstations = await queryAll('SELECT * FROM workstations ORDER BY last_active_at DESC');
    res.json({ success: true, workstations });
  } catch (error) {
    next(error);
  }
});

// POST /api/college/workstations/register
collegeRouter.post('/workstations/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      workstation_name: z.string().min(1),
      hardware_id: z.string().min(1),
    });

    const { workstation_name, hardware_id } = schema.parse(req.body);
    const db = getDb();

    // Check existing
    const existing = await queryOne('SELECT * FROM workstations WHERE hardware_id = ?', [hardware_id]);
    if (existing) {
      await db.execute({
        sql: 'UPDATE workstations SET workstation_name = ?, last_active_at = CURRENT_TIMESTAMP WHERE id = ?',
        args: [workstation_name, existing.id],
      });
      return res.json({ success: true, workstation: existing });
    }

    // Up to 10 workstations limit check
    const countRow = await queryOne('SELECT COUNT(*) as count FROM workstations WHERE is_active = 1');
    if (Number(countRow.count) >= 10) {
      throw new AppError('Maximum limit of 10 active workstations reached. Please contact the administrator.', 400, 'WORKSTATION_LIMIT_EXCEEDED');
    }

    const id = `ws_${Date.now()}`;
    await db.execute({
      sql: `INSERT INTO workstations (id, workstation_name, hardware_id, registered_by, is_active)
            VALUES (?, ?, ?, ?, 1)`,
      args: [id, workstation_name, hardware_id, req.user!.id],
    });

    const created = await queryOne('SELECT * FROM workstations WHERE id = ?', [id]);
    res.json({ success: true, workstation: created });
  } catch (error) {
    next(error);
  }
});
