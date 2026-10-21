import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/index.js';
import { seedDatabase } from '../src/database/seed.js';
import { queryOne, getDb } from '../src/database/db.js';

describe('MASTER PROMPT 7 — Class Details Workspace, Financial Accuracy & Role Security', () => {
  let adminToken: string;
  let feeManagerToken: string;
  let assignedTeacherToken: string;
  let unassignedTeacherToken: string;

  let activeSessionId: string;
  let testClassId: string;
  let isolatedClassId: string;

  let studentPaidId: string;
  let studentPartialId: string;
  let studentUnpaidId: string;
  let studentOtherClassId: string;

  const feeS1 = 12000;
  const feeS2 = 12000;
  const feeS3 = 12000;
  const paymentS1 = 12000;
  const paymentS2 = 6000;

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

    // 4. Create two distinct classes for strict isolation testing
    const timestamp = Date.now();
    const class1Res = await request(app)
      .post('/api/college/classes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `MP7 Class Primary ${timestamp}`,
        program_id: 'prog_fsc_pm',
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
        name: `MP7 Class Isolated ${timestamp}`,
        program_id: 'prog_ics',
        academic_session_id: activeSessionId,
        section: 'B',
        default_monthly_fee: 14000,
        status: 'active',
      });
    expect(class2Res.status).toBe(200);
    isolatedClassId = class2Res.body.class.id;

    // 5. Create Teacher assigned ONLY to testClassId
    const teacherUser = `mp7_teacher_assigned_${timestamp}`;
    const teacherRes = await request(app)
      .post('/api/staff')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        full_name: 'Assigned Teacher MP7',
        username: teacherUser,
        email: `${teacherUser}@zec.edu.pk`,
        password: 'Password@123',
        designation: 'Senior Lecturer',
        department: 'Science',
        role: 'teacher',
        has_login: true,
        assigned_class_ids: [testClassId],
      });
    expect(teacherRes.status).toBe(201);

    const teacherLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: teacherUser, password: 'Password@123' });
    assignedTeacherToken = teacherLogin.body.token;

    // 6. Create Teacher NOT assigned to testClassId
    const unassignedUser = `mp7_teacher_unassigned_${timestamp}`;
    const unassignedRes = await request(app)
      .post('/api/staff')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        full_name: 'Unassigned Teacher MP7',
        username: unassignedUser,
        email: `${unassignedUser}@zec.edu.pk`,
        password: 'Password@123',
        designation: 'Junior Lecturer',
        department: 'Arts',
        role: 'teacher',
        has_login: true,
        assigned_class_ids: [isolatedClassId],
      });
    expect(unassignedRes.status).toBe(201);

    const unassignedLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: unassignedUser, password: 'Password@123' });
    unassignedTeacherToken = unassignedLogin.body.token;

    // 7. Enroll Students in testClassId
    // Student 1: Paid in Full
    const s1Res = await request(app)
      .post('/api/students/admit')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        roll_number: `MP7-S1-${timestamp.toString().slice(-4)}`,
        full_name: 'Tariq Mehmood',
        father_name: 'Mehmood Ali',
        guardian_phone: '03001112223',
        program_id: 'prog_fsc_pm',
        class_id: testClassId,
        academic_session_id: activeSessionId,
        admission_date: '2026-09-01',
        total_package_fee: feeS1,
      });
    expect(s1Res.status).toBe(201);
    studentPaidId = s1Res.body.student.id;

    // Student 2: Partially Paid
    const s2Res = await request(app)
      .post('/api/students/admit')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        roll_number: `MP7-S2-${timestamp.toString().slice(-4)}`,
        full_name: 'Bilal Khan',
        father_name: 'Nawaz Khan',
        guardian_phone: '03004445556',
        program_id: 'prog_fsc_pm',
        class_id: testClassId,
        academic_session_id: activeSessionId,
        admission_date: '2026-09-01',
        total_package_fee: feeS2,
      });
    expect(s2Res.status).toBe(201);
    studentPartialId = s2Res.body.student.id;

    // Student 3: Unpaid
    const s3Res = await request(app)
      .post('/api/students/admit')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        roll_number: `MP7-S3-${timestamp.toString().slice(-4)}`,
        full_name: 'Zeeshan Akhtar',
        father_name: 'Akhtar Hussain',
        guardian_phone: '03007778889',
        program_id: 'prog_fsc_pm',
        class_id: testClassId,
        academic_session_id: activeSessionId,
        admission_date: '2026-09-01',
        total_package_fee: feeS3,
      });
    expect(s3Res.status).toBe(201);
    studentUnpaidId = s3Res.body.student.id;

    // Enroll 1 Student in isolatedClassId to verify strict isolation
    const sOtherRes = await request(app)
      .post('/api/students/admit')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        roll_number: `MP7-OTHER-${timestamp.toString().slice(-4)}`,
        full_name: 'Hamza Farooq',
        father_name: 'Farooq Ahmed',
        guardian_phone: '03009990001',
        program_id: 'prog_ics',
        class_id: isolatedClassId,
        academic_session_id: activeSessionId,
        admission_date: '2026-09-01',
        total_package_fee: 90000,
      });
    expect(sOtherRes.status).toBe(201);
    studentOtherClassId = sOtherRes.body.student.id;

    // 8. Generate Class Challans for testClassId
    const challanRes = await request(app)
      .post('/api/challans/generate')
      .set('Authorization', `Bearer ${feeManagerToken}`)
      .send({
        scope: 'single_class',
        class_id: testClassId,
        academic_session_id: activeSessionId,
        billing_period: '2026-10',
        due_date: '2026-10-30',
      });
    expect(challanRes.status).toBe(200);

    // Fetch generated invoices for S1 and S2
    const inv1 = await queryOne(
      'SELECT id FROM fee_invoices WHERE student_id = ? ORDER BY created_at DESC LIMIT 1',
      [studentPaidId]
    );
    expect(inv1).toBeDefined();

    const inv2 = await queryOne(
      'SELECT id FROM fee_invoices WHERE student_id = ? ORDER BY created_at DESC LIMIT 1',
      [studentPartialId]
    );
    expect(inv2).toBeDefined();

    // 9. Post Payments: S1 Paid in Full (80,000), S2 Partially Paid (25,000)
    const pay1 = await request(app)
      .post('/api/payments/collect')
      .set('Authorization', `Bearer ${feeManagerToken}`)
      .send({
        invoice_id: inv1.id,
        amount: paymentS1,
        payment_method: 'bank_transfer',
        payment_date: '2026-10-05',
        idempotency_key: `PAY-MP7-S1-${timestamp}`,
      });
    expect(pay1.status).toBe(201);

    const pay2 = await request(app)
      .post('/api/payments/collect')
      .set('Authorization', `Bearer ${feeManagerToken}`)
      .send({
        invoice_id: inv2.id,
        amount: paymentS2,
        payment_method: 'cash',
        payment_date: '2026-10-06',
        idempotency_key: `PAY-MP7-S2-${timestamp}`,
      });
    expect(pay2.status).toBe(201);
  });

  // =========================================================================
  // 1. CLASS DETAILS WORKSPACE & FINANCIAL SUMMARY TESTS
  // =========================================================================
  describe('2.1 & 2.2: Class Details Workspace & Financial Summary Accuracy', () => {
    it('Admin retrieves complete Class Details workspace with exact financial reconciliation', async () => {
      const res = await request(app)
        .get(`/api/college/classes/${testClassId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify Class Header Metadata
      expect(res.body.class.id).toBe(testClassId);
      expect(res.body.class.academic_session_id).toBe(activeSessionId);
      expect(res.body.class.status).toBe('active');

      // Verify Class Financial Summary
      const summary = res.body.financial_summary;
      expect(summary).toBeDefined();
      expect(summary.total_enrolled).toBe(3);

      const expectedTotalAgreed = feeS1 + feeS2 + feeS3; // 80,000 + 60,000 + 50,000 = 190,000
      const expectedTotalCollected = paymentS1 + paymentS2; // 80,000 + 25,000 = 105,000
      const expectedRemaining = expectedTotalAgreed - expectedTotalCollected; // 85,000

      expect(summary.total_agreed_fee).toBe(expectedTotalAgreed);
      expect(summary.total_collected).toBe(expectedTotalCollected);
      expect(summary.total_remaining_balance).toBe(expectedRemaining);

      // Breakdown counts
      expect(summary.students_fully_paid).toBe(1); // Student 1
      expect(summary.students_with_balance).toBe(2); // Student 2 & 3
    });

    it('Fee Manager retrieves identical financial summary with student fee details', async () => {
      const res = await request(app)
        .get(`/api/college/classes/${testClassId}`)
        .set('Authorization', `Bearer ${feeManagerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.financial_summary).toBeDefined();
      expect(res.body.financial_summary.total_agreed_fee).toBe(feeS1 + feeS2 + feeS3);
    });

    it('Strict Class Scoping: Students from other classes are never included', async () => {
      const res = await request(app)
        .get(`/api/college/classes/${testClassId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const studentIds = res.body.students.map((s: any) => s.id);

      expect(studentIds).toContain(studentPaidId);
      expect(studentIds).toContain(studentPartialId);
      expect(studentIds).toContain(studentUnpaidId);
      expect(studentIds).not.toContain(studentOtherClassId); // Out of scope
    });
  });

  // =========================================================================
  // 2. STUDENT TABLE & PAYMENT STATUS DETERMINATION
  // =========================================================================
  describe('2.3: Student Table Columns and Real Payment Status Calculation', () => {
    it('Verifies student table columns and accurate status for Paid, Partially Paid, and Unpaid', async () => {
      const res = await request(app)
        .get(`/api/college/classes/${testClassId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const students = res.body.students;

      // Student 1: Paid in Full
      const s1 = students.find((s: any) => s.id === studentPaidId);
      expect(s1).toBeDefined();
      expect(s1.agreed_package_fee).toBe(feeS1);
      expect(s1.amount_paid).toBe(paymentS1);
      expect(s1.remaining_balance).toBe(0);
      expect(s1.payment_status).toBe('paid');

      // Student 2: Partially Paid
      const s2 = students.find((s: any) => s.id === studentPartialId);
      expect(s2).toBeDefined();
      expect(s2.agreed_package_fee).toBe(feeS2);
      expect(s2.amount_paid).toBe(paymentS2);
      expect(s2.remaining_balance).toBe(feeS2 - paymentS2);
      expect(s2.payment_status).toBe('partially_paid');

      // Student 3: Unpaid
      const s3 = students.find((s: any) => s.id === studentUnpaidId);
      expect(s3).toBeDefined();
      expect(s3.agreed_package_fee).toBe(feeS3);
      expect(s3.amount_paid).toBe(0);
      expect(s3.remaining_balance).toBe(feeS3);
      expect(s3.payment_status).toBe('unpaid');
    });

    it('Accurately detects Overdue status when an invoice has passed its due date', async () => {
      // Temporarily mark Student 3 invoice due date in the past
      await getDb().execute("UPDATE fee_invoices SET due_date = '2026-09-01' WHERE student_id = ?", [studentUnpaidId]);

      const res = await request(app)
        .get(`/api/college/classes/${testClassId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const s3 = res.body.students.find((s: any) => s.id === studentUnpaidId);
      expect(s3.payment_status).toBe('overdue');
      expect(res.body.financial_summary.students_overdue).toBe(1);

      // Restore due date back to future
      await getDb().execute("UPDATE fee_invoices SET due_date = '2026-10-30' WHERE student_id = ?", [studentUnpaidId]);
    });
  });

  // =========================================================================
  // 3. ROLE-BASED ACCESS CONTROL & STRICT TEACHER ISOLATION
  // =========================================================================
  describe('3: Role-Based Access Control and Teacher Financial Redaction', () => {
    it('Assigned Teacher can access class roster but financial summary is strictly null', async () => {
      const res = await request(app)
        .get(`/api/college/classes/${testClassId}`)
        .set('Authorization', `Bearer ${assignedTeacherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.class.id).toBe(testClassId);

      // Financial summary MUST be null for Teacher
      expect(res.body.financial_summary).toBeNull();
      expect(res.body.feeStructures.length).toBe(0);

      // Student list is returned with demographics but all financial attributes omitted
      expect(res.body.students.length).toBe(3);
      for (const std of res.body.students) {
        expect(std.roll_number).toBeDefined();
        expect(std.full_name).toBeDefined();
        expect(std.agreed_package_fee).toBeUndefined();
        expect(std.amount_paid).toBeUndefined();
        expect(std.remaining_balance).toBeUndefined();
        expect(std.current_invoice_amount).toBeUndefined();
        expect(std.payment_status).toBeUndefined();
      }
    });

    it('Unassigned Teacher is denied access to the class (403 TEACHER_CLASS_ACCESS_DENIED)', async () => {
      const res = await request(app)
        .get(`/api/college/classes/${testClassId}`)
        .set('Authorization', `Bearer ${unassignedTeacherToken}`);

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('TEACHER_CLASS_ACCESS_DENIED');
    });

    it('Fee Manager CANNOT administer users or manage staff through class endpoints', async () => {
      const res = await request(app)
        .get('/api/staff')
        .set('Authorization', `Bearer ${feeManagerToken}`);

      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // 4. CLASS-LEVEL CHALLAN GENERATION & IDEMPOTENCY
  // =========================================================================
  describe('2.6: Class-Level Challan Workflow from Class Details', () => {
    it('Generating challans for class skips duplicate students and avoids double billing', async () => {
      const res = await request(app)
        .post('/api/challans/generate')
        .set('Authorization', `Bearer ${feeManagerToken}`)
        .send({
          scope: 'single_class',
          class_id: testClassId,
          academic_session_id: activeSessionId,
          billing_period: '2026-10', // Same billing period as before
          due_date: '2026-10-30',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.summary.generated).toBe(0); // 0 newly generated
      expect(res.body.summary.skipped_duplicate).toBe(3); // All 3 skipped safely
    });
  });

  // =========================================================================
  // 5. REVERSAL INTEGRITY & REAL-TIME RECONCILIATION
  // =========================================================================
  describe('Financial Reversal Effect on Class Summary', () => {
    it('Reversing a payment immediately updates class collected and remaining balance', async () => {
      // Find S2 payment
      const paymentRecord = await queryOne(
        'SELECT id FROM fee_payments WHERE student_id = ? AND is_reversed = 0 LIMIT 1',
        [studentPartialId]
      );
      expect(paymentRecord).toBeDefined();

      // Admin reverses S2 payment
      const revRes = await request(app)
        .post(`/api/payments/${paymentRecord.id}/reverse`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Reversal verification test for Class Details' });
      expect(revRes.status).toBe(200);

      // Re-query Class Details
      const classRes = await request(app)
        .get(`/api/college/classes/${testClassId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(classRes.status).toBe(200);
      const summary = classRes.body.financial_summary;

      // S2 payment (25,000) was reversed; now only S1 (80,000) is collected
      expect(summary.total_collected).toBe(paymentS1);
      expect(summary.total_remaining_balance).toBe(summary.total_agreed_fee - paymentS1);

      // S2 payment status reverts from 'partially_paid' to 'unpaid'
      const s2 = classRes.body.students.find((s: any) => s.id === studentPartialId);
      expect(s2.amount_paid).toBe(0);
      expect(s2.remaining_balance).toBe(feeS2);
      expect(s2.payment_status).toBe('unpaid');
    });
  });
});
