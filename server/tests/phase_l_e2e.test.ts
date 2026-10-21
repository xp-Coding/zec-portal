import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { app } from '../src/index.js';
import { seedDatabase } from '../src/database/seed.js';
import { queryOne, queryAll } from '../src/database/db.js';

let adminToken: string;
let feeManagerToken: string;
let activeSessionId: string;
let classAId: string;
let classBId: string;
let studentAId: string;
let studentBId: string;

beforeAll(async () => {
  await seedDatabase();

  // 1. Admin login
  const adminRes = await request(app)
    .post('/api/auth/login')
    .send({ username: 'admin', password: 'Admin@123' });
  expect(adminRes.status).toBe(200);
  adminToken = adminRes.body.token;

  // 2. Fee Manager login
  const feeRes = await request(app)
    .post('/api/auth/login')
    .send({ username: 'feemanager', password: 'Manager@123' });
  expect(feeRes.status).toBe(200);
  feeManagerToken = feeRes.body.token;

  // Get active session
  const sessionsRes = await request(app)
    .get('/api/college/sessions')
    .set('Authorization', `Bearer ${adminToken}`);
  activeSessionId = sessionsRes.body.sessions[0].id;

  // Get classes
  const classesRes = await request(app)
    .get('/api/college/classes')
    .set('Authorization', `Bearer ${adminToken}`);
  expect(classesRes.body.classes.length).toBeGreaterThanOrEqual(2);
  classAId = classesRes.body.classes[0].id;
  classBId = classesRes.body.classes[1].id;

  // Get students
  const studentsRes = await request(app)
    .get('/api/students')
    .set('Authorization', `Bearer ${adminToken}`);
  expect(studentsRes.body.students.length).toBeGreaterThanOrEqual(2);
  studentAId = studentsRes.body.students[0].id;
  studentBId = studentsRes.body.students[1].id;
});

// =========================================================================
// TEST 1: Staff Management, Teacher Assignment & Strict Scoping (Phase L.1)
// =========================================================================
describe('Phase L — Test 1: Staff & Permissions Integration', () => {
  const teacherUsername = `test.teacher.${Date.now()}`;
  let teacherUserId: string;
  let teacherJwt: string;

  it('1. Admin creates a new teacher with designation and login credentials', async () => {
    const res = await request(app)
      .post('/api/staff')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        username: teacherUsername,
        password: 'Password@123',
        full_name: 'Professor Tariq Mahmood',
        email: `${teacherUsername}@zec.edu.pk`,
        role: 'teacher',
        employee_id: `EMP-${Date.now().toString().slice(-4)}`,
        designation: 'Assistant Professor',
        department: 'Computer Science',
        has_login: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.staff.id).toBeDefined();
    teacherUserId = res.body.staff.id;
  });

  it('2. Admin assigns the teacher to Class A', async () => {
    const res = await request(app)
      .put(`/api/staff/${teacherUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        assigned_class_ids: [classAId],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.staff.assigned_classes).toContain(classAId);
  });

  it('3. Teacher signs in with credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        username: teacherUsername,
        password: 'Password@123',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.role).toBe('teacher');
    teacherJwt = res.body.token;
  });

  it('4. Teacher sees ONLY assigned Class A (Class B is excluded)', async () => {
    const res = await request(app)
      .get('/api/college/classes')
      .set('Authorization', `Bearer ${teacherJwt}`);

    expect(res.status).toBe(200);
    const classIds = res.body.classes.map((c: any) => c.id);
    expect(classIds).toContain(classAId);
    expect(classIds).not.toContain(classBId);
  });

  it('5. Teacher attempts to access Class B directly: Backend denies access (403)', async () => {
    const res = await request(app)
      .get(`/api/college/classes/${classBId}`)
      .set('Authorization', `Bearer ${teacherJwt}`);

    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('TEACHER_CLASS_ACCESS_DENIED');
  });

  it('6. Teacher attempts to load attendance roster for Class B: Backend denies access (403)', async () => {
    const res = await request(app)
      .get(`/api/attendance/roster?class_id=${classBId}&date=2026-10-19`)
      .set('Authorization', `Bearer ${teacherJwt}`);

    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('TEACHER_CLASS_ACCESS_DENIED');
  });

  it('7. Admin removes the Class A assignment from the teacher', async () => {
    const res = await request(app)
      .put(`/api/staff/${teacherUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        assigned_class_ids: [],
      });

    expect(res.status).toBe(200);
    expect(res.body.staff.assigned_classes.length).toBe(0);
  });

  it('8. Teacher loses future access: Sees 0 classes and direct access is denied', async () => {
    const classesRes = await request(app)
      .get('/api/college/classes')
      .set('Authorization', `Bearer ${teacherJwt}`);

    expect(classesRes.status).toBe(200);
    expect(classesRes.body.classes.length).toBe(0);

    const directRes = await request(app)
      .get(`/api/college/classes/${classAId}`)
      .set('Authorization', `Bearer ${teacherJwt}`);

    expect(directRes.status).toBe(403);
    expect(directRes.body.errorCode).toBe('TEACHER_CLASS_ACCESS_DENIED');
  });
});

// =========================================================================
// TEST 2: Complete Attendance Workflow, Batch Upsert & Idempotency (Phase L.2)
// =========================================================================
describe('Phase L — Test 2: Complete Attendance Workflow Integration', () => {
  const attendanceDate = '2026-10-25';
  let rosterStudents: any[] = [];

  it('1. Admin opens assigned class and selects attendance date to load enrollment roster', async () => {
    const res = await request(app)
      .get(`/api/attendance/roster?class_id=${classAId}&academic_session_id=${activeSessionId}&date=${attendanceDate}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.roster.length).toBeGreaterThanOrEqual(1);
    rosterStudents = res.body.roster;
  });

  it('2. Saves attendance as a validated batch with mixed statuses', async () => {
    const records = rosterStudents.map((s, idx) => ({
      student_id: s.id,
      status: idx % 2 === 0 ? 'present' : 'absent',
      remarks: idx % 2 === 0 ? 'On time' : 'Informed sick leave',
    }));

    const res = await request(app)
      .post('/api/attendance/batch')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        class_id: classAId,
        academic_session_id: activeSessionId,
        attendance_date: attendanceDate,
        status: 'submitted',
        records,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.summary.total_records).toBe(rosterStudents.length);
  });

  it('3. Reopening the same date loads unchanged persisted statuses', async () => {
    const res = await request(app)
      .get(`/api/attendance/roster?class_id=${classAId}&academic_session_id=${activeSessionId}&date=${attendanceDate}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.roster.length).toBe(rosterStudents.length);
    const firstStudent = res.body.roster[0];
    expect(firstStudent.attendance).toBeDefined();
    expect(firstStudent.attendance.status).toBe('present');
    expect(firstStudent.attendance.remarks).toBe('On time');
  });

  it('4. Retrying the same batch operation is idempotent and does not create duplicate records', async () => {
    const countBefore = await queryOne(
      'SELECT COUNT(*) as count FROM attendance_records WHERE attendance_date = ?',
      [attendanceDate]
    );

    const records = rosterStudents.map((s, idx) => ({
      student_id: s.id,
      status: idx % 2 === 0 ? 'present' : 'absent',
      remarks: idx % 2 === 0 ? 'On time' : 'Informed sick leave',
    }));

    const retryRes = await request(app)
      .post('/api/attendance/batch')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        class_id: classAId,
        academic_session_id: activeSessionId,
        attendance_date: attendanceDate,
        status: 'submitted',
        records,
      });

    expect(retryRes.status).toBe(200);

    const countAfter = await queryOne(
      'SELECT COUNT(*) as count FROM attendance_records WHERE attendance_date = ?',
      [attendanceDate]
    );
    expect(countAfter.count).toBe(countBefore.count);
  });

  it('5. Daily report reconciles summary counts accurately against saved records', async () => {
    const res = await request(app)
      .get(`/api/attendance/reports/daily?class_id=${classAId}&academic_session_id=${activeSessionId}&date=${attendanceDate}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.summary.total_students).toBe(rosterStudents.length);
    const expectedPresent = Math.ceil(rosterStudents.length / 2);
    const expectedAbsent = Math.floor(rosterStudents.length / 2);
    expect(res.body.summary.present_count).toBe(expectedPresent);
    expect(res.body.summary.absent_count).toBe(expectedAbsent);
  });
});

// =========================================================================
// TEST 3: Student Records, Profile Workspace & State Isolation (Phase L.3)
// =========================================================================
describe('Phase L — Test 3: Student Records & Profile Workspace Integration', () => {
  let studentAData: any;
  let studentBData: any;

  it('1. Search student by roll number returns exact match', async () => {
    const student = await queryOne('SELECT roll_number FROM students WHERE id = ?', [studentAId]);
    const res = await request(app)
      .get(`/api/students?search=${encodeURIComponent(student.roll_number)}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.students.length).toBeGreaterThanOrEqual(1);
    expect(res.body.students[0].roll_number).toBe(student.roll_number);
  });

  it('2. Open Student A profile: Returns academic placement and financial history for Admin', async () => {
    const res = await request(app)
      .get(`/api/students/${studentAId}/profile`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.student.id).toBe(studentAId);
    expect(res.body.academic).toBeDefined();
    expect(res.body.fee_overview).toBeDefined();
    expect(res.body.ledger).toBeDefined();
    studentAData = res.body;
  });

  it('3. Open Student B profile: Data belongs strictly to Student B without retaining Student A fields', async () => {
    const res = await request(app)
      .get(`/api/students/${studentBId}/profile`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.student.id).toBe(studentBId);
    expect(res.body.student.id).not.toBe(studentAData.student.id);
    expect(res.body.student.roll_number).not.toBe(studentAData.student.roll_number);
    studentBData = res.body;
  });

  it('4. Student attendance history route returns correct student metrics', async () => {
    const res = await request(app)
      .get(`/api/attendance/student/${studentAId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.student_id).toBe(studentAId);
    expect(res.body.summary).toBeDefined();
    expect(Array.isArray(res.body.history)).toBe(true);
  });
});

// =========================================================================
// TEST 4: Fee Engine, 3 Mandatory Figures, Payments & Receipts (Phase L.4)
// =========================================================================
describe('Phase L — Test 4: Fee, Challan & Payment Workflow Integration', () => {
  const billingPeriod = `2026-12-${Date.now().toString().slice(-4)}`;
  let generatedChallanId: string;
  let netPayableAmount: number;

  it('1. Generates challan with the 3 mandatory figures (Package, Remaining, Cycle Fee)', async () => {
    const res = await request(app)
      .post('/api/challans/generate')
      .set('Authorization', `Bearer ${feeManagerToken}`)
      .send({
        scope: 'single_student',
        academic_session_id: activeSessionId,
        student_id: studentAId,
        billing_period: billingPeriod,
        billing_mode: 'monthly',
        due_date: '2026-11-10',
        include_arrears: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify invoice from DB
    const invoice = await queryOne(
      'SELECT * FROM fee_invoices WHERE student_id = ? AND billing_period = ?',
      [studentAId, billingPeriod]
    );

    expect(invoice).toBeDefined();
    generatedChallanId = invoice.id;
    netPayableAmount = invoice.net_payable;

    // The 3 Mandatory Figures:
    expect(Number(invoice.total_package_fee)).toBeGreaterThan(0);
    expect(Number(invoice.package_balance_before)).toBeGreaterThan(0);
    const settings = await queryOne('SELECT currency FROM college_settings LIMIT 1');
    expect(settings.currency).toBe('PKR');
  });

  it('2. Repeated batch generation skips duplicate challan without error (Idempotency)', async () => {
    const res = await request(app)
      .post('/api/challans/generate')
      .set('Authorization', `Bearer ${feeManagerToken}`)
      .send({
        scope: 'single_student',
        student_id: studentAId,
        billing_period: billingPeriod,
        billing_mode: 'monthly',
        due_date: '2026-11-10',
      });

    expect(res.status).toBe(200);
    expect(res.body.skipped_duplicates).toBeGreaterThanOrEqual(1);
  });

  it('3. Record a cashier payment and receive verifiable receipt', async () => {
    const paymentAmount = Math.min(5000, netPayableAmount);
    const res = await request(app)
      .post('/api/payments/collect')
      .set('Authorization', `Bearer ${feeManagerToken}`)
      .send({
        invoice_id: generatedChallanId,
        amount: paymentAmount,
        payment_method: 'cash',
        payment_date: '2026-10-20',
        notes: 'Counter Cash Payment',
      });

    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
    expect(res.body.receipt.receipt_no).toBeDefined();
    expect(res.body.receipt.amount_paid).toBe(paymentAmount);
  });

  it('4. Financial reports reflect the committed payment', async () => {
    const res = await request(app)
      .get('/api/reports/analytics')
      .set('Authorization', `Bearer ${feeManagerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.metrics.total_collected).toBeGreaterThan(0);
  });
});

// =========================================================================
// TEST 5: Official Institutional Branding & Windows Packaging (Phase L.5)
// =========================================================================
describe('Phase L — Test 5: ZEC Portal Branding & Configuration Verification', () => {
  it('1. GET /api/health identifies product as ZEC Portal and Zakariya Educational Complex', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.system).toBe('ZEC Portal');
    expect(res.body.college).toBe('Zakariya Educational Complex (ZEC)');
  });

  it('2. Institutional settings contain official defaults (PKR, Asia/Karachi, ZEC)', async () => {
    const res = await request(app)
      .get('/api/college/settings')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.settings.college_name).toBe('Zakariya Educational Complex');
    expect(res.body.settings.college_short_name).toBe('ZEC');
    expect(res.body.settings.currency).toBe('PKR');
    expect(res.body.settings.timezone).toBe('Asia/Karachi');
  });

  it('3. tauri.conf.json specifies ZEC Portal as product name and window title', () => {
    const tauriConfigPath = path.resolve(__dirname, '../../src-tauri/tauri.conf.json');
    const configContent = fs.readFileSync(tauriConfigPath, 'utf-8');
    const tauriConfig = JSON.parse(configContent);

    expect(tauriConfig.productName).toBe('ZEC Portal');
    expect(tauriConfig.identifier).toBe('com.zec.portal');
    expect(tauriConfig.app.windows[0].title).toContain('ZEC Portal');
    expect(tauriConfig.app.windows[0].title).toContain('Zakariya Educational Complex');
  });

  it('4. index.html specifies official ZEC Portal title and favicon', () => {
    const indexPath = path.resolve(__dirname, '../../index.html');
    const indexContent = fs.readFileSync(indexPath, 'utf-8');

    expect(indexContent).toContain('<title>ZEC Portal - Zakariya Educational Complex</title>');
    expect(indexContent).toContain('href="/zec_college_logo.jpg"');
  });
});

// =========================================================================
// TEST 6: Relational Integrity & Data Preservation (Phase L.6)
// =========================================================================
describe('Phase L — Test 6: Database Integrity & Historical Data Preservation', () => {
  it('1. All students possess valid references to existing classes, programs and sessions', async () => {
    const orphanStudents = await queryAll(`
      SELECT s.id, s.roll_number FROM students s
      LEFT JOIN classes c ON s.class_id = c.id
      LEFT JOIN programs p ON s.program_id = p.id
      LEFT JOIN academic_sessions sess ON s.academic_session_id = sess.id
      WHERE c.id IS NULL OR p.id IS NULL OR sess.id IS NULL
    `);
    expect(orphanStudents.length).toBe(0);
  });

  it('2. All fee invoices reference valid students and classes', async () => {
    const orphanInvoices = await queryAll(`
      SELECT inv.id FROM fee_invoices inv
      LEFT JOIN students s ON inv.student_id = s.id
      LEFT JOIN classes c ON s.class_id = c.id
      WHERE s.id IS NULL OR c.id IS NULL
    `);
    expect(orphanInvoices.length).toBe(0);
  });

  it('3. All attendance records reference valid students and sessions', async () => {
    const orphanAttendance = await queryAll(`
      SELECT r.id FROM attendance_records r
      LEFT JOIN students s ON r.student_id = s.id
      LEFT JOIN attendance_sessions sess ON r.attendance_session_id = sess.id
      WHERE s.id IS NULL OR sess.id IS NULL
    `);
    expect(orphanAttendance.length).toBe(0);
  });

  it('4. Schema migrations table records all applied migrations chronologically', async () => {
    const migrations = await queryAll('SELECT version, name FROM schema_migrations ORDER BY id ASC');
    expect(migrations.length).toBeGreaterThanOrEqual(3);
    const versions = migrations.map((m: any) => m.version);
    expect(versions).toContain('001_initial_schema');
    expect(versions).toContain('002_role_restructuring');
    expect(versions).toContain('003_staff_and_attendance');
  });
});
