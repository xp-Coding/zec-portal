import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { queryOne, queryAll, runTransaction } from '../database/db.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission, requireRole } from '../middleware/rbac.js';
import { AppError } from '../middleware/errorHandler.js';
import { logAuditEvent } from '../middleware/audit.js';
import crypto from 'crypto';

export const challanRouter = Router();
challanRouter.use(authenticate);
challanRouter.use(requireRole('admin', 'fee_manager'));

// Helper to generate unique challan number
function generateChallanNo(): string {
  const year = new Date().getFullYear();
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `CH-${year}-${rand}`;
}

// ==========================================
// 1. One-Click Challan Generation Engine
// ==========================================

const generateChallansSchema = z.object({
  scope: z.enum(['entire_college', 'single_class', 'single_student']),
  academic_session_id: z.string().optional(),
  class_id: z.string().optional(),
  student_id: z.string().optional(),
  billing_period: z.string().min(1, 'Billing period is required (e.g. 2026-03 or INST-01)'),
  billing_mode: z.enum(['monthly', 'installment']).default('monthly'),
  installment_no: z.number().int().min(1).optional(),
  issue_date: z.string().default(() => new Date().toISOString().split('T')[0]),
  due_date: z.string().min(1, 'Due date is required'),
  include_arrears: z.boolean().default(true),
});

// POST /api/challans/generate
challanRouter.post('/generate', requirePermission('challan:generate'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const params = generateChallansSchema.parse(req.body);

    if (params.scope === 'single_class' && !params.class_id) {
      throw new AppError('class_id is required for single_class scope', 400, 'MISSING_CLASS_ID');
    }
    if (params.scope === 'single_student' && !params.student_id) {
      throw new AppError('student_id is required for single_student scope', 400, 'MISSING_STUDENT_ID');
    }

    let targetSessionId = params.academic_session_id;
    if (!targetSessionId) {
      if (params.student_id) {
        const s = await queryOne('SELECT academic_session_id FROM students WHERE id = ?', [params.student_id]);
        if (s?.academic_session_id) targetSessionId = s.academic_session_id;
      } else if (params.class_id) {
        const c = await queryOne('SELECT academic_session_id FROM classes WHERE id = ?', [params.class_id]);
        if (c?.academic_session_id) targetSessionId = c.academic_session_id;
      }
      if (!targetSessionId) {
        const active = await queryOne('SELECT id FROM academic_sessions WHERE is_active = 1 LIMIT 1');
        targetSessionId = active?.id;
      }
    }

    if (!targetSessionId) {
      throw new AppError('No active academic session found for challan generation', 400, 'NO_ACTIVE_SESSION');
    }

    // 1. Query eligible active students based on scope
    let studentQuery = `
      SELECT 
        s.*,
        c.name as class_name,
        p.name as program_name,
        fp.id as fee_plan_id,
        fp.billing_mode as plan_billing_mode,
        fp.total_package_fee as agreed_package_fee,
        fp.standard_monthly_fee,
        fp.total_installments,
        fp.installments_schedule_json,
        fp.approved_discount_type,
        fp.approved_discount_value
      FROM students s
      JOIN classes c ON s.class_id = c.id
      JOIN programs p ON s.program_id = p.id
      LEFT JOIN student_fee_plans fp ON s.id = fp.student_id
      WHERE s.status = 'active'
    `;
    const queryArgs: any[] = [];

    if (params.scope === 'single_student') {
      studentQuery += ' AND s.id = ?';
      queryArgs.push(params.student_id);
    } else {
      studentQuery += ' AND s.academic_session_id = ?';
      queryArgs.push(targetSessionId);

      if (params.scope === 'single_class') {
        studentQuery += ' AND s.class_id = ?';
        queryArgs.push(params.class_id);
      }
    }

    const eligibleStudents = await queryAll(studentQuery, queryArgs);

    if (eligibleStudents.length === 0) {
      return res.json({
        success: true,
        message: 'No eligible active students found for the specified scope and session.',
        summary: {
          total_eligible: 0,
          generated: 0,
          skipped_duplicate: 0,
          total_billed_amount: 0,
          total_arrears_included: 0,
          total_discounts: 0,
          failed: 0,
        },
        challans: [],
      });
    }

    let generatedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    let totalBilled = 0;
    let totalArrears = 0;
    let totalDiscounts = 0;
    const generatedChallans: any[] = [];
    const errors: any[] = [];

    // Process each student in bounded atomic transactions
    for (const student of eligibleStudents) {
      try {
        const studentBillingMode = student.plan_billing_mode || student.billing_plan || params.billing_mode;

        // Idempotency check: Check if challan already exists for this student and billing period
        const existingInvoice = await queryOne(
          `SELECT id, challan_no FROM fee_invoices 
           WHERE student_id = ? AND billing_period = ? AND billing_mode = ?`,
          [student.id, params.billing_period, studentBillingMode]
        );

        if (existingInvoice) {
          skippedCount++;
          continue;
        }

        // Package calculations
        const packageFee = student.agreed_package_fee ?? student.total_package_fee;
        
        // Sum previous package paid
        const paidRow = await queryOne(`
          SELECT COALESCE(SUM(pa.package_amount_credited), 0) as paid
          FROM payment_allocations pa
          JOIN fee_payments pay ON pa.payment_id = pay.id
          WHERE pay.student_id = ?
        `, [student.id]);
        const packagePaidToDate = Number(paidRow?.paid || 0);
        const packageBalanceBefore = Math.max(0, packageFee - packagePaidToDate);

        // Determine current cycle charge
        let currentCycleFee = 0;
        let lineItemDescription = '';

        if (studentBillingMode === 'monthly') {
          currentCycleFee = Number(student.standard_monthly_fee || 0);
          lineItemDescription = `Monthly Tuition Fee (${params.billing_period})`;
        } else {
          // Installment mode
          const instNo = params.installment_no || 1;
          lineItemDescription = `Installment #${instNo} (${params.billing_period})`;
          
          if (student.installments_schedule_json) {
            try {
              const schedule = JSON.parse(student.installments_schedule_json);
              const found = schedule.find((s: any) => s.installment_no === instNo);
              if (found) {
                currentCycleFee = Number(found.amount);
              }
            } catch {
              // fallback
            }
          }
          if (currentCycleFee === 0) {
            const numInst = student.total_installments || 4;
            currentCycleFee = Math.round(packageFee / numInst);
          }
        }

        // Calculate Arrears carried forward from prior unpaid invoices
        let arrears = 0;
        if (params.include_arrears) {
          const arrearsRow = await queryOne(`
            SELECT COALESCE(SUM(remaining_invoice_balance), 0) as total_arrears
            FROM fee_invoices
            WHERE student_id = ? AND status IN ('unpaid', 'partially_paid', 'overdue')
          `, [student.id]);
          arrears = Number(arrearsRow?.total_arrears || 0);
        }

        // Calculate Discount / Scholarship
        let discount = 0;
        const discType = student.approved_discount_type || student.scholarship_type;
        const discVal = Number(student.approved_discount_value || student.scholarship_value || 0);

        if (discType === 'percentage' && discVal > 0) {
          discount = Math.round((currentCycleFee * discVal) / 100);
        } else if (discType === 'fixed' && discVal > 0) {
          discount = Math.min(discVal, currentCycleFee);
        }

        // Net Payable Now
        const netPayable = Math.max(0, currentCycleFee + arrears - discount);
        const invoiceId = `inv_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        const challanNo = generateChallanNo();
        const idempotencyKey = `CH-${student.id}-${params.billing_period}-${studentBillingMode}`;

        // Insert invoice and item atomically
        await runTransaction(async (tx) => {
          await tx.execute({
            sql: `INSERT INTO fee_invoices (
              id, challan_no, student_id, academic_session_id, fee_plan_id,
              billing_period, billing_mode, installment_no, total_installments,
              issue_date, due_date, total_package_fee, package_paid_to_date,
              package_balance_before, current_cycle_fee, arrears_carried_forward,
              late_fine, discount_amount, net_payable, amount_paid,
              remaining_invoice_balance, status, idempotency_key, created_by, workstation_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 0, ?, 'unpaid', ?, ?, ?)`,
            args: [
              invoiceId, challanNo, student.id, student.academic_session_id || targetSessionId, student.fee_plan_id || null,
              params.billing_period, studentBillingMode, params.installment_no || null, student.total_installments || null,
              params.issue_date, params.due_date, packageFee, packagePaidToDate,
              packageBalanceBefore, currentCycleFee, arrears, discount, netPayable,
              netPayable, idempotencyKey, req.user!.id, req.workstationId || 'WS-MAIN',
            ],
          });

          // Insert main line item
          await tx.execute({
            sql: `INSERT INTO invoice_items (id, invoice_id, fee_head, description, amount, is_package_fee)
                  VALUES (?, ?, 'tuition', ?, ?, 1)`,
            args: [`item_${Date.now()}_1`, invoiceId, lineItemDescription, currentCycleFee],
          });

          if (arrears > 0) {
            await tx.execute({
              sql: `INSERT INTO invoice_items (id, invoice_id, fee_head, description, amount, is_package_fee)
                    VALUES (?, ?, 'other', 'Previous Unpaid Arrears Carried Forward', ?, 0)`,
              args: [`item_${Date.now()}_2`, invoiceId, arrears],
            });
          }

          if (discount > 0) {
            await tx.execute({
              sql: `INSERT INTO invoice_items (id, invoice_id, fee_head, description, amount, is_package_fee)
                    VALUES (?, ?, 'other', 'Approved Scholarship / Concession', ?, 0)`,
              args: [`item_${Date.now()}_3`, invoiceId, -discount],
            });
          }
        });

        generatedCount++;
        totalBilled += netPayable;
        totalArrears += arrears;
        totalDiscounts += discount;

        generatedChallans.push({
          id: invoiceId,
          challan_no: challanNo,
          student_id: student.id,
          roll_number: student.roll_number,
          full_name: student.full_name,
          class_name: student.class_name,
          total_package_fee: packageFee,
          package_balance_before: packageBalanceBefore,
          current_cycle_fee: currentCycleFee,
          arrears_carried_forward: arrears,
          discount_amount: discount,
          net_payable: netPayable,
          issue_date: params.issue_date,
          due_date: params.due_date,
          status: 'unpaid',
        });
      } catch (err: any) {
        failedCount++;
        errors.push({
          student_id: student.id,
          roll_number: student.roll_number,
          error: err.message,
        });
      }
    }

    // Audit the batch generation
    await logAuditEvent({
      eventType: 'CHALLAN_GENERATION_BATCH',
      actorId: req.user!.id,
      actorName: req.user!.username,
      role: req.user!.role,
      workstationId: req.workstationId!,
      targetTable: 'fee_invoices',
      targetId: `batch_${Date.now()}`,
      action: 'GENERATE_CHALLANS',
      afterValue: {
        scope: params.scope,
        billing_period: params.billing_period,
        eligible: eligibleStudents.length,
        generated: generatedCount,
        skipped: skippedCount,
        failed: failedCount,
        total_billed: totalBilled,
      },
    });

    res.json({
      success: true,
      skipped_duplicates: skippedCount,
      summary: {
        total_eligible: eligibleStudents.length,
        generated: generatedCount,
        skipped_duplicate: skippedCount,
        total_billed_amount: totalBilled,
        total_arrears_included: totalArrears,
        total_discounts: totalDiscounts,
        failed: failedCount,
      },
      errors: errors.length > 0 ? errors : undefined,
      challans: generatedChallans,
    });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// 2. Query Challans / Invoices
// ==========================================

// GET /api/challans
challanRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search, class_id, status, billing_period, page = '1', limit = '50' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
    const offset = (pageNum - 1) * limitNum;

    let whereClause = 'WHERE 1=1';
    const args: any[] = [];

    if (search) {
      whereClause += ' AND (inv.challan_no LIKE ? OR s.roll_number LIKE ? OR s.full_name LIKE ?)';
      const term = `%${search}%`;
      args.push(term, term, term);
    }
    if (class_id) {
      whereClause += ' AND s.class_id = ?';
      args.push(class_id);
    }
    if (status) {
      whereClause += ' AND inv.status = ?';
      args.push(status);
    }
    if (billing_period) {
      whereClause += ' AND inv.billing_period = ?';
      args.push(billing_period);
    }

    const countSql = `
      SELECT COUNT(*) as total
      FROM fee_invoices inv
      JOIN students s ON inv.student_id = s.id
      ${whereClause}
    `;
    const countRes = await queryOne(countSql, args);
    const total = Number(countRes?.total || 0);

    const sql = `
      SELECT 
        inv.*,
        s.roll_number,
        s.full_name,
        s.father_name,
        c.name as class_name,
        p.name as program_name,
        sess.name as session_name
      FROM fee_invoices inv
      JOIN students s ON inv.student_id = s.id
      JOIN classes c ON s.class_id = c.id
      JOIN programs p ON s.program_id = p.id
      JOIN academic_sessions sess ON inv.academic_session_id = sess.id
      ${whereClause}
      ORDER BY inv.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const challans = await queryAll(sql, [...args, limitNum, offset]);

    res.json({
      success: true,
      challans,
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

// GET /api/challans/:id
challanRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;

    const challan = await queryOne(`
      SELECT 
        inv.*,
        s.roll_number,
        s.full_name,
        s.father_name,
        s.guardian_phone,
        c.name as class_name,
        p.name as program_name,
        sess.name as session_name
      FROM fee_invoices inv
      JOIN students s ON inv.student_id = s.id
      JOIN classes c ON s.class_id = c.id
      JOIN programs p ON s.program_id = p.id
      JOIN academic_sessions sess ON inv.academic_session_id = sess.id
      WHERE inv.id = ? OR inv.challan_no = ?
    `, [id, id]);

    if (!challan) {
      throw new AppError('Challan not found', 404, 'NOT_FOUND');
    }

    const items = await queryAll('SELECT * FROM invoice_items WHERE invoice_id = ?', [challan.id]);
    const settings = await queryOne('SELECT * FROM college_settings LIMIT 1');

    res.json({
      success: true,
      challan,
      items,
      college: settings,
    });
  } catch (error) {
    next(error);
  }
});
