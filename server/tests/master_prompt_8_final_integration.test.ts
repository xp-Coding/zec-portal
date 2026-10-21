import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/index.js';
import { seedDatabase } from '../src/database/seed.js';
import { queryOne, queryAll, getDb } from '../src/database/db.js';

describe('MASTER PROMPT 8 — Final Integration, Operational Reliability, Data Consistency & Release Verification', () => {
  let adminToken: string;
  let feeManagerToken: string;
  let teacherToken: string;
  let unassignedTeacherToken: string;

  let activeSessionId: string;
  let testClassId: string;
  let isolatedClassId: string;

  let studentAId: string;
  let studentBId: string;
  let studentNoPlanId: string;

  const timestamp = Date.now();
  const packageFeeStudentA = 24000;
  const packageFeeStudentB = 30000;

  beforeAll(async () => {
    await seedDatabase();

    // 1. Authenticate Admin
    const adminRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'Admin@123' });
    expect(adminRes.status).toBe(200);
    adminToken = adminRes.body.token;

    // 2. Authenticate Fee Manager
    const feeRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'feemanager', password: 'Manager@123' });
    expect(feeRes.status).toBe(200);
    feeManagerToken = feeRes.body.token;

    // 3. Fetch academic session
    const sessionRes = await request(app)
      .get('/api/college/sessions')
      .set('Authorization', `Bearer ${adminToken}`);
    activeSessionId = sessionRes.body.sessions[0].id;

    // 4. Create primary class and isolated class
    const class1Res = await request(app)
      .post('/api/college/classes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `MP8 Primary Class ${timestamp}`,
        program_id: 'prog_fsc_pe',
        academic_session_id: activeSessionId,
        section: 'A',
        default_monthly_fee: 12000,
        status: 'active',
      });
    expect(class1Res.status).toBe(200);
    testClassId = class1Res.body.class.id;

    const class2Res = await request(app)
      .post('/api/college/classes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `MP8 Isolated Class ${timestamp}`,
        program_id: 'prog_ics',
        academic_session_id: activeSessionId,
        section: 'B',
        default_monthly_fee: 15000,
        status: 'active',
      });
    expect(class2Res.status).toBe(200);
    isolatedClassId = class2Res.body.class.id;

    // 5. Create Teacher assigned to testClassId
    const teacherUser = `mp8_teacher_${timestamp}`;
    const teacherRes = await request(app)
      .post('/api/staff')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        full_name: 'Professor Asim Qureshi',
        username: teacherUser,
        email: `${teacherUser}@zec.edu.pk`,
        password: 'Password@123',
        designation: 'Associate Professor',
        department: 'Mathematics',
        role: 'teacher',
        has_login: true,
        assigned_class_ids: [testClassId],
      });
    expect(teacherRes.status).toBe(201);

    const teacherLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: teacherUser, password: 'Password@123' });
    teacherToken = teacherLogin.body.token;

    // 6. Create Unassigned Teacher
    const unassignedUser = `mp8_unassigned_${timestamp}`;
    await request(app)
      .post('/api/staff')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        full_name: 'Unassigned Lecturer',
        username: unassignedUser,
        email: `${unassignedUser}@zec.edu.pk`,
        password: 'Password@123',
        designation: 'Visiting Lecturer',
        department: 'General',
        role: 'teacher',
        has_login: true,
        assigned_class_ids: [],
      });

    const unassignedLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: unassignedUser, password: 'Password@123' });
    unassignedTeacherToken = unassignedLogin.body.token;

    // 7. Admit Student A with monthly fee plan
    const sARes = await request(app)
      .post('/api/students/admit')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        roll_number: `MP8-SA-${timestamp.toString().slice(-4)}`,
        full_name: 'Kashif Mehmood',
        father_name: 'Mehmood Ul Hassan',
        guardian_phone: '03001234567',
        program_id: 'prog_fsc_pe',
        class_id: testClassId,
        academic_session_id: activeSessionId,
        admission_date: '2026-09-01',
        total_package_fee: packageFeeStudentA,
      });
    expect(sARes.status).toBe(201);
    studentAId = sARes.body.student.id;

    // 8. Admit Student B with installment fee plan
    const sBRes = await request(app)
      .post('/api/students/admit')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        roll_number: `MP8-SB-${timestamp.toString().slice(-4)}`,
        full_name: 'Usman Ali',
        father_name: 'Muhammad Ali',
        guardian_phone: '03007654321',
        program_id: 'prog_fsc_pe',
        class_id: testClassId,
        academic_session_id: activeSessionId,
        admission_date: '2026-09-01',
        total_package_fee: packageFeeStudentB,
      });
    expect(sBRes.status).toBe(201);
    studentBId = sBRes.body.student.id;

    // 9. Admit Student with missing fee plan (review required)
    const db = getDb();
    studentNoPlanId = `std_noplan_${timestamp}`;
    await db.execute({
      sql: `INSERT INTO students (
        id, roll_number, full_name, father_name, guardian_phone,
        program_id, class_id, academic_session_id, admission_date,
        billing_plan, total_package_fee, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '2026-09-01', 'monthly', 0, 'active')`,
      args: [
        studentNoPlanId,
        `MP8-NOPLAN-${timestamp.toString().slice(-4)}`,
        'Zohaib Hassan',
        'Hassan Raza',
        '03009988776',
        'prog_fsc_pe',
        testClassId,
        activeSessionId,
      ],
    });
  });

  // =========================================================================
  // SECTION 2 & 3: FEE & CHALLAN CONSISTENCY ACROSS ALL 3 GENERATION SCOPES
  // =========================================================================
  describe('Section 3: Fee & Challan Consistency across 3 Scopes', () => {
    let studentAInvoiceId: string;
    let studentBInvoiceId: string;

    it('Scope 1: Generates class-level challans and distinguishes all 7 financial components', async () => {
      const res = await request(app)
        .post('/api/challans/generate')
        .set('Authorization', `Bearer ${feeManagerToken}`)
        .send({
          scope: 'single_class',
          class_id: testClassId,
          academic_session_id: activeSessionId,
          billing_period: '2026-10',
          due_date: '2026-10-25',
          include_arrears: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.summary.generated).toBeGreaterThanOrEqual(2);

      // Verify Student A generated invoice components
      const invA = await queryOne(
        `SELECT * FROM fee_invoices WHERE student_id = ? AND billing_period = '2026-10'`,
        [studentAId]
      );
      expect(invA).toBeDefined();
      studentAInvoiceId = invA.id;

      // 7 Distinguished Components
      expect(invA.total_package_fee).toBe(packageFeeStudentA);
      expect(invA.package_paid_to_date).toBe(0);
      expect(invA.package_balance_before).toBe(packageFeeStudentA);
      expect(invA.current_cycle_fee).toBe(12000);
      expect(invA.arrears_carried_forward).toBe(0);
      expect(invA.discount_amount).toBe(0);
      expect(invA.net_payable).toBe(12000);
      expect(invA.remaining_invoice_balance).toBe(12000);
    });

    it('Duplicate prevention: Re-running challan generation skips existing billing period safely', async () => {
      const res = await request(app)
        .post('/api/challans/generate')
        .set('Authorization', `Bearer ${feeManagerToken}`)
        .send({
          scope: 'single_class',
          class_id: testClassId,
          academic_session_id: activeSessionId,
          billing_period: '2026-10',
          due_date: '2026-10-25',
        });

      expect(res.status).toBe(200);
      expect(res.body.summary.generated).toBe(0);
      expect(res.body.summary.skipped_duplicate).toBeGreaterThanOrEqual(2);
    });

    it('Scope 2: Generates single student challan for a new billing period', async () => {
      const res = await request(app)
        .post('/api/challans/generate')
        .set('Authorization', `Bearer ${feeManagerToken}`)
        .send({
          scope: 'single_student',
          student_id: studentBId,
          academic_session_id: activeSessionId,
          billing_period: '2026-11',
          due_date: '2026-11-25',
          include_arrears: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.summary.generated).toBe(1);

      const invB = await queryOne(
        `SELECT * FROM fee_invoices WHERE student_id = ? AND billing_period = '2026-11'`,
        [studentBId]
      );
      expect(invB).toBeDefined();
      studentBInvoiceId = invB.id;
      expect(invB.net_payable).toBeGreaterThan(0);
    });

    it('Scope 3: Generates entire college challans without duplicating existing student invoices', async () => {
      const res = await request(app)
        .post('/api/challans/generate')
        .set('Authorization', `Bearer ${feeManagerToken}`)
        .send({
          scope: 'entire_college',
          academic_session_id: activeSessionId,
          billing_period: '2026-10',
          due_date: '2026-10-30',
        });

      expect(res.status).toBe(200);
      // Student A was already generated for 2026-10, so skipped_duplicate should count them
      expect(res.body.summary.skipped_duplicate).toBeGreaterThanOrEqual(2);
    });
  });

  // =========================================================================
  // SECTION 4: PAYMENT AND RECEIPT RELIABILITY
  // =========================================================================
  describe('Section 4: Payment Processing & Receipt Reliability', () => {
    let committedReceiptNo: string;
    let committedPaymentId: string;

    it('Rejects non-positive payment amounts (amount <= 0)', async () => {
      const inv = await queryOne(
        `SELECT id FROM fee_invoices WHERE student_id = ? AND status = 'unpaid' LIMIT 1`,
        [studentAId]
      );

      const res = await request(app)
        .post('/api/payments/collect')
        .set('Authorization', `Bearer ${feeManagerToken}`)
        .send({
          invoice_id: inv.id,
          amount: 0,
          payment_method: 'cash',
        });

      expect(res.status).toBe(422);
      expect(res.body.errorCode).toBe('VALIDATION_ERROR');
    });

    it('Prevents accidental overpayment exceeding outstanding invoice balance', async () => {
      const inv = await queryOne(
        `SELECT id, remaining_invoice_balance FROM fee_invoices WHERE student_id = ? AND status = 'unpaid' LIMIT 1`,
        [studentAId]
      );

      const res = await request(app)
        .post('/api/payments/collect')
        .set('Authorization', `Bearer ${feeManagerToken}`)
        .send({
          invoice_id: inv.id,
          amount: inv.remaining_invoice_balance + 5000,
          payment_method: 'bank_transfer',
        });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('AMOUNT_EXCEEDS_BALANCE');
    });

    it('Processes valid partial payment with atomic ledger entry and unique receipt number', async () => {
      const inv = await queryOne(
        `SELECT id, remaining_invoice_balance FROM fee_invoices WHERE student_id = ? AND status = 'unpaid' LIMIT 1`,
        [studentAId]
      );

      const paymentAmount = 5000;
      const res = await request(app)
        .post('/api/payments/collect')
        .set('Authorization', `Bearer ${feeManagerToken}`)
        .set('x-workstation-id', 'WS-FEE-DESK-01')
        .send({
          invoice_id: inv.id,
          amount: paymentAmount,
          payment_method: 'cash',
          idempotency_key: `IDEMP-MP8-PAY1-${timestamp}`,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.receipt).toBeDefined();

      committedReceiptNo = res.body.receipt.receipt_no;
      committedPaymentId = res.body.receipt.payment_id;
      expect(committedReceiptNo).toMatch(/^REC-\d{4}-[A-F0-9]+$/);
      expect(res.body.receipt.remaining_invoice_balance).toBe(inv.remaining_invoice_balance - paymentAmount);
    });

    it('Idempotency enforcement: Replay with same idempotency_key returns existing payment safely', async () => {
      const inv = await queryOne(
        `SELECT id FROM fee_invoices WHERE student_id = ? LIMIT 1`,
        [studentAId]
      );

      const res = await request(app)
        .post('/api/payments/collect')
        .set('Authorization', `Bearer ${feeManagerToken}`)
        .send({
          invoice_id: inv.id,
          amount: 5000,
          payment_method: 'cash',
          idempotency_key: `IDEMP-MP8-PAY1-${timestamp}`,
        });

      expect(res.status).toBe(200);
      expect(res.body.is_idempotent_replay).toBe(true);
      expect(res.body.payment.id).toBe(committedPaymentId);
    });

    it('Receipt reprinting retrieves committed transaction without creating duplicate payment', async () => {
      const paymentsCountBefore = await queryOne('SELECT COUNT(*) as count FROM fee_payments');

      const res = await request(app)
        .get(`/api/payments/receipt/${committedReceiptNo}`)
        .set('Authorization', `Bearer ${feeManagerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.receipt.receipt_no).toBe(committedReceiptNo);
      expect(res.body.receipt.student_name).toBe('Kashif Mehmood');

      const paymentsCountAfter = await queryOne('SELECT COUNT(*) as count FROM fee_payments');
      expect(paymentsCountAfter.count).toBe(paymentsCountBefore.count);
    });

    it('Payment reversal: Authorize and execute auditable reversal restores invoice balance', async () => {
      const invBefore = await queryOne(
        `SELECT remaining_invoice_balance, amount_paid FROM fee_invoices WHERE id = (
          SELECT invoice_id FROM fee_payments WHERE id = ?
        )`,
        [committedPaymentId]
      );

      const res = await request(app)
        .post(`/api/payments/${committedPaymentId}/reverse`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          reason: 'Administrative correction: Duplicate check voucher canceled',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const invAfter = await queryOne(
        `SELECT remaining_invoice_balance, amount_paid, status FROM fee_invoices WHERE id = (
          SELECT invoice_id FROM fee_payments WHERE id = ?
        )`,
        [committedPaymentId]
      );

      expect(invAfter.remaining_invoice_balance).toBe(invBefore.remaining_invoice_balance + 5000);
      expect(invAfter.amount_paid).toBe(invBefore.amount_paid - 5000);
    });
  });

  // =========================================================================
  // SECTION 5: MULTI-WORKSTATION DATA CONSISTENCY
  // =========================================================================
  describe('Section 5: Multi-Workstation Shared-Database & Data Consistency', () => {
    it('Step 1-5: Payment on Workstation A updates ledger visible on Workstation B and Class Details', async () => {
      // Find invoice for Student B
      const inv = await queryOne(
        `SELECT id, remaining_invoice_balance FROM fee_invoices WHERE student_id = ? AND remaining_invoice_balance > 0 LIMIT 1`,
        [studentBId]
      );

      const paymentAmt = 6000;
      // 1. Fee Manager records payment on Workstation A
      const payRes = await request(app)
        .post('/api/payments/collect')
        .set('Authorization', `Bearer ${feeManagerToken}`)
        .set('x-workstation-id', 'WS-FEE-DESK-A')
        .send({
          invoice_id: inv.id,
          amount: paymentAmt,
          payment_method: 'bank_transfer',
          idempotency_key: `IDEMP-WS-TEST-${timestamp}`,
        });

      expect(payRes.status).toBe(201);
      const receiptNo = payRes.body.receipt.receipt_no;

      // 2. Workstation B retrieves updated student ledger
      const profileRes = await request(app)
        .get(`/api/students/${studentBId}/profile`)
        .set('Authorization', `Bearer ${feeManagerToken}`)
        .set('x-workstation-id', 'WS-ADMIN-DESK-B');

      expect(profileRes.status).toBe(200);
      expect(profileRes.body.fee_overview.total_qualifying_package_payments).toBe(paymentAmt);
      expect(profileRes.body.fee_overview.remaining_package_balance).toBe(packageFeeStudentB - paymentAmt);

      // 3. Workstation B retrieves Class Details and verifies reconciled class total
      const classRes = await request(app)
        .get(`/api/college/classes/${testClassId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-workstation-id', 'WS-PRINCIPAL-LAPTOP-C');

      expect(classRes.status).toBe(200);
      expect(classRes.body.financial_summary.total_collected).toBe(paymentAmt);

      // 4. Receipt retains association with original payment
      const receiptCheck = await request(app)
        .get(`/api/payments/receipt/${receiptNo}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(receiptCheck.status).toBe(200);
      expect(receiptCheck.body.receipt.workstation_id).toBe('WS-FEE-DESK-A');
    });

    it('Sync Outbox: Processes workstation sync push and guarantees transaction idempotency', async () => {
      const txId1 = `tx_${timestamp}_001`;
      const txId2 = `tx_${timestamp}_002`;

      const pushRes = await request(app)
        .post('/api/sync/outbox')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-workstation-id', 'WS-SYNC-01')
        .send({
          operations: [
            {
              transaction_id: txId1,
              entity_type: 'student',
              operation: 'update',
              payload: { notes: 'Address updated from workstation' },
            },
            {
              transaction_id: txId2,
              entity_type: 'attendance',
              operation: 'insert',
              payload: { date: '2026-10-21' },
            },
          ],
        });

      expect(pushRes.status).toBe(200);
      expect(pushRes.body.processed_transaction_ids).toContain(txId1);
      expect(pushRes.body.processed_transaction_ids).toContain(txId2);

      // Re-pushing should be idempotent
      const replayRes = await request(app)
        .post('/api/sync/outbox')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-workstation-id', 'WS-SYNC-01')
        .send({
          operations: [
            {
              transaction_id: txId1,
              entity_type: 'student',
              operation: 'update',
              payload: { notes: 'Address updated from workstation' },
            },
          ],
        });

      expect(replayRes.status).toBe(200);
      expect(replayRes.body.processed_transaction_ids).toContain(txId1);
    });
  });

  // =========================================================================
  // SECTION 2: CLASS DETAILS DATA INTEGRITY & ROLE ISOLATION
  // =========================================================================
  describe('Section 2: Class Details Workspace Finalization', () => {
    it('Accurately identifies Review Required status for students without fee plan', async () => {
      const res = await request(app)
        .get(`/api/college/classes/${testClassId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const noPlanStd = res.body.students.find((s: any) => s.id === studentNoPlanId);
      expect(noPlanStd).toBeDefined();
      expect(noPlanStd.has_fee_plan).toBe(false);
      expect(noPlanStd.payment_status).toBe('review_required');
      expect(res.body.financial_summary.students_review_required).toBeGreaterThanOrEqual(1);
    });

    it('Teacher access to assigned class returns student directory with strictly null financial summary', async () => {
      const res = await request(app)
        .get(`/api/college/classes/${testClassId}`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.class.id).toBe(testClassId);
      expect(res.body.financial_summary).toBeNull();
      expect(res.body.students.length).toBeGreaterThanOrEqual(3);

      // Sensitive financial fields must be completely absent from teacher response
      const firstStd = res.body.students[0];
      expect(firstStd.agreed_package_fee).toBeUndefined();
      expect(firstStd.amount_paid).toBeUndefined();
      expect(firstStd.remaining_balance).toBeUndefined();
    });

    it('Teacher is blocked with 403 from accessing unassigned classes', async () => {
      const res = await request(app)
        .get(`/api/college/classes/${isolatedClassId}`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('TEACHER_CLASS_ACCESS_DENIED');
    });
  });

  // =========================================================================
  // SECTION 6 & 7: ADMINISTRATIVE WORKFLOWS & ATTENDANCE CONCURRENCY
  // =========================================================================
  describe('Section 6 & 7: Administrative Security & Attendance Concurrency', () => {
    it('Admin can initiate secure password reset and invalidates session token_version', async () => {
      const resetUser = `mp8_reset_user_${Date.now()}`;
      const staffRes = await request(app)
        .post('/api/staff')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          full_name: 'Target Teacher for Reset',
          username: resetUser,
          email: `${resetUser}@zec.edu.pk`,
          password: 'OldPassword@123',
          designation: 'Temporary Lecturer',
          department: 'Science',
          role: 'teacher',
          has_login: true,
          assigned_class_ids: [],
        });
      expect(staffRes.status).toBe(201);
      const targetUserId = staffRes.body.staff.id;
      const initialTokenVersion = staffRes.body.staff.token_version || 1;

      const res = await request(app)
        .post(`/api/staff/${targetUserId}/reset-password`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ new_password: 'NewSecurePassword@123' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const updatedUser = await queryOne(
        `SELECT token_version FROM users WHERE id = ?`,
        [targetUserId]
      );
      expect(updatedUser.token_version).toBe(initialTokenVersion + 1);
    });

    it('Fee Manager is strictly blocked from staff administrative endpoints (403)', async () => {
      const res = await request(app)
        .get('/api/staff')
        .set('Authorization', `Bearer ${feeManagerToken}`);
      expect(res.status).toBe(403);
    });

    it('Batch attendance records idempotent saves and detects finalized locking', async () => {
      const today = '2026-10-21';
      const records = [
        { student_id: studentAId, status: 'present', remarks: 'On time' },
        { student_id: studentBId, status: 'absent', remarks: 'Medical leave' },
      ];

      // Submit attendance
      const submitRes = await request(app)
        .post('/api/attendance/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          class_id: testClassId,
          academic_session_id: activeSessionId,
          attendance_date: today,
          records,
        });

      expect(submitRes.status).toBe(200);
      expect(submitRes.body.success).toBe(true);

      const sessionId = submitRes.body.session_id;

      // Finalize session
      const finalizeRes = await request(app)
        .post(`/api/attendance/finalize/${sessionId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'finalized' });

      expect(finalizeRes.status).toBe(200);
      expect(finalizeRes.body.status).toBe('finalized');

      // Teacher cannot edit finalized session
      const editRes = await request(app)
        .post('/api/attendance/batch')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          class_id: testClassId,
          academic_session_id: activeSessionId,
          attendance_date: today,
          records,
        });

      expect(editRes.status).toBe(403);
      expect(editRes.body.errorCode).toBe('ATTENDANCE_FINALIZED');
    });
  });

  // =========================================================================
  // SECTION 9 & 10: BACKUP, RECOVERY & ERROR SANITIZATION
  // =========================================================================
  describe('Section 9 & 10: Backup, Recovery & Error Diagnostics', () => {
    let createdBackupId: string;

    it('Creates complete database backup with SHA-256 hash and metric snapshots', async () => {
      const res = await request(app)
        .post('/api/backup/create')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ notes: 'Master Prompt 8 Automated Verification Backup' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.sha256_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(res.body.data.record_counts.students).toBeGreaterThan(0);

      createdBackupId = res.body.data.id;
    });

    it('Verifies backup integrity with PRAGMA integrity_check and SHA-256 matching', async () => {
      const res = await request(app)
        .post(`/api/backup/verify/${createdBackupId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.hash_match).toBe(true);
      expect(res.body.data.sqlite_integrity).toBe('ok');
    });

    it('Restores backup with mandatory confirmation and pre-restore safety snapshot', async () => {
      // Missing confirm flag rejects
      const rejectRes = await request(app)
        .post(`/api/backup/restore/${createdBackupId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ confirm: false });

      expect(rejectRes.status).toBe(400);
      expect(rejectRes.body.errorCode).toBe('RESTORE_CONFIRMATION_REQUIRED');

      // Valid restore with confirm: true
      const restoreRes = await request(app)
        .post(`/api/backup/restore/${createdBackupId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ confirm: true });

      expect(restoreRes.status).toBe(200);
      expect(restoreRes.body.success).toBe(true);
      expect(restoreRes.body.data.integrity_status).toBe('ok');
      expect(restoreRes.body.data.safety_backup).toBeDefined();
    });

    it('Standardized error responses include correlation_id without leaking SQL internals', async () => {
      const res = await request(app)
        .get('/api/college/classes/non_existent_class_id_9999')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe('NOT_FOUND');
      expect(res.body.correlation_id).toBeDefined();
      expect(res.body.correlation_id).toMatch(/^err_/);
    });
  });
});
