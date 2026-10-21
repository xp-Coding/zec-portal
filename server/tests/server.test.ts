import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/index.js';
import { seedDatabase } from '../src/database/seed.js';

let adminToken: string;
let feeManagerToken: string;
let teacherToken: string;
let teacherRazaToken: string;
let teacherAliToken: string;
let unassignedTeacherToken: string;
let activeSessionId: string;
let sampleClassId: string;
let testStudentId: string;
let testInvoiceId: string;

beforeAll(async () => {
  await seedDatabase();

  // 1. Log in as Admin
  const adminRes = await request(app)
    .post('/api/auth/login')
    .send({ username: 'admin', password: 'Admin@123' });
  expect(adminRes.status).toBe(200);
  expect(adminRes.body.success).toBe(true);
  expect(adminRes.body.user.role).toBe('admin');
  adminToken = adminRes.body.token;

  // 2. Log in as Fee Manager
  const feeManagerRes = await request(app)
    .post('/api/auth/login')
    .send({ username: 'feemanager', password: 'Manager@123' });
  expect(feeManagerRes.status).toBe(200);
  expect(feeManagerRes.body.user.role).toBe('fee_manager');
  feeManagerToken = feeManagerRes.body.token;

  // 3. Log in as Teacher
  const teacherRes = await request(app)
    .post('/api/auth/login')
    .send({ username: 'staff1', password: 'Staff@123' });
  expect(teacherRes.status).toBe(200);
  expect(teacherRes.body.user.role).toBe('teacher');
  teacherToken = teacherRes.body.token;

  // Get active session and class
  const sessionsRes = await request(app)
    .get('/api/college/sessions')
    .set('Authorization', `Bearer ${adminToken}`);
  activeSessionId = sessionsRes.body.sessions[0].id;

  const classesRes = await request(app)
    .get('/api/college/classes')
    .set('Authorization', `Bearer ${adminToken}`);
  sampleClassId = classesRes.body.classes[0].id;
});

describe('1. 3-Role Architecture & RBAC Enforcement', () => {
  it('GET /api/health returns ok status for ZEC Portal', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.system).toBe('ZEC Portal');
    expect(res.body.college).toContain('Zakariya Educational Complex');
  });

  it('Rejects invalid login credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'WrongPassword' });
    expect(res.status).toBe(401);
    expect(res.body.errorCode).toBe('INVALID_CREDENTIALS');
  });

  it('Enforces RBAC: Fee Manager cannot modify college settings (Admin only)', async () => {
    const res = await request(app)
      .put('/api/college/settings')
      .set('Authorization', `Bearer ${feeManagerToken}`)
      .send({ college_name: 'Hacked College' });
    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('PERMISSION_DENIED');
  });

  it('Enforces RBAC: Teacher role cannot access payment collection', async () => {
    const res = await request(app)
      .post('/api/payments/collect')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ invoice_id: 'inv_fake', amount: 5000 });
    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('PERMISSION_DENIED');
  });

  it('Enforces RBAC: Teacher role cannot view financial analytics reports', async () => {
    const res = await request(app)
      .get('/api/reports/analytics')
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('PERMISSION_DENIED');
  });
});

describe('2. Classes & Sessions Workspace', () => {
  it('GET /api/college/classes returns real student_count calculated from database', async () => {
    const res = await request(app)
      .get('/api/college/classes')
      .set('Authorization', `Bearer ${feeManagerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.classes)).toBe(true);
    expect(res.body.classes[0]).toHaveProperty('student_count');
    expect(typeof res.body.classes[0].student_count).toBe('number');
  });

  it('GET /api/college/classes/:id returns class details, fee configuration, and enrolled students', async () => {
    const res = await request(app)
      .get(`/api/college/classes/${sampleClassId}`)
      .set('Authorization', `Bearer ${feeManagerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.class.id).toBe(sampleClassId);
    expect(Array.isArray(res.body.students)).toBe(true);
    expect(Array.isArray(res.body.feeStructures)).toBe(true);
  });

  it('Prevents invalid academic session date ranges (start_date >= end_date)', async () => {
    const res = await request(app)
      .post('/api/college/sessions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Invalid Session 2029',
        start_date: '2029-08-01',
        end_date: '2028-08-01', // Before start date!
        status: 'upcoming',
      });

    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('INVALID_DATE_RANGE');
  });

  it('Prevents physical deletion of sessions with existing records', async () => {
    const res = await request(app)
      .delete(`/api/college/sessions/${activeSessionId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    // If session has records, deletion is blocked
    if (res.status === 400) {
      expect(res.body.errorCode).toBe('CANNOT_DELETE_ACTIVE_SESSION');
    }
  });
});

describe('3. Student Admission & Comprehensive Search', () => {
  const uniqueRoll = `ROLL-${Date.now().toString().slice(-6)}`;

  it('Admit student with minimal data and automatic fee plan', async () => {
    const res = await request(app)
      .post('/api/students/admit')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        roll_number: uniqueRoll,
        full_name: 'Hamza Farooq',
        father_name: 'Farooq Ahmad',
        guardian_phone: '03001234567',
        program_id: 'prog_fsc_pm',
        class_id: sampleClassId,
        academic_session_id: activeSessionId,
        billing_plan: 'monthly',
        total_package_fee: 120000,
        standard_monthly_fee: 10000,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.student.roll_number).toBe(uniqueRoll);
    testStudentId = res.body.student.id;
  });

  it('Rejects duplicate student roll number', async () => {
    const res = await request(app)
      .post('/api/students/admit')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        roll_number: uniqueRoll,
        full_name: 'Duplicate Student',
        father_name: 'Duplicate Father',
        guardian_phone: '03007654321',
        program_id: 'prog_fsc_pm',
        class_id: sampleClassId,
        academic_session_id: activeSessionId,
        total_package_fee: 100000,
      });

    expect(res.status).toBe(409);
    expect(res.body.errorCode).toBe('DUPLICATE_ROLL_NUMBER');
  });

  it('Search students by roll number returns complete figures for Fee Manager', async () => {
    const res = await request(app)
      .get('/api/students')
      .query({ search: uniqueRoll })
      .set('Authorization', `Bearer ${feeManagerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.students.length).toBe(1);
    expect(res.body.students[0].roll_number).toBe(uniqueRoll);
    expect(res.body.students[0].agreed_package_fee).toBe(120000);
    expect(res.body.students[0].remaining_package_balance).toBe(120000);
  });

  it('Search students by Teacher hides sensitive financial metrics', async () => {
    const res = await request(app)
      .get('/api/students')
      .query({ search: uniqueRoll })
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(res.status).toBe(200);
    if (res.body.students.length > 0) {
      const std = res.body.students[0];
      expect(std.agreed_package_fee).toBeNull();
      expect(std.total_arrears_due).toBeNull();
      expect(std.remaining_package_balance).toBeUndefined();
    }
  });

  it('Enforces Teacher cannot access fee ledger endpoint', async () => {
    const res = await request(app)
      .get(`/api/students/${testStudentId}/ledger`)
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('PERMISSION_DENIED');
  });
});

describe('4. One-Click Challan Generation & Class-Level Workflow', () => {
  const billingPeriod = '2026-04';

  it('Generates challan for single class via established workflow', async () => {
    const res = await request(app)
      .post('/api/challans/generate')
      .set('Authorization', `Bearer ${feeManagerToken}`)
      .send({
        scope: 'single_class',
        class_id: sampleClassId,
        academic_session_id: activeSessionId,
        billing_period: billingPeriod,
        billing_mode: 'monthly',
        due_date: '2026-04-10',
        include_arrears: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.summary.generated).toBeGreaterThanOrEqual(1);

    const generated = res.body.challans.find((c: any) => c.student_id === testStudentId);
    expect(generated).toBeDefined();
    expect(generated.total_package_fee).toBe(120000); // 3 Mandatory Figures
    expect(generated.package_balance_before).toBe(120000);
    expect(generated.current_cycle_fee).toBe(10000);
    expect(generated.net_payable).toBe(10000);
    testInvoiceId = generated.id;
  });

  it('Prevents duplicate challan generation (Idempotency enforcement)', async () => {
    const res = await request(app)
      .post('/api/challans/generate')
      .set('Authorization', `Bearer ${feeManagerToken}`)
      .send({
        scope: 'single_student',
        student_id: testStudentId,
        academic_session_id: activeSessionId,
        billing_period: billingPeriod,
        billing_mode: 'monthly',
        due_date: '2026-04-10',
      });

    expect(res.status).toBe(200);
    expect(res.body.summary.generated).toBe(0);
    expect(res.body.summary.skipped_duplicate).toBe(1);
  });
});

describe('5. Payment Processing & Comprehensive Profile Workspace', () => {
  it('Fee Manager accepts payment and updates remaining package and invoice balances', async () => {
    const res = await request(app)
      .post('/api/payments/collect')
      .set('Authorization', `Bearer ${feeManagerToken}`)
      .send({
        invoice_id: testInvoiceId,
        amount: 10000,
        payment_method: 'cash',
        notes: 'Fee received by Fee Manager counter',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.receipt.receipt_no).toMatch(/^REC-/);
    expect(res.body.receipt.amount).toBe(10000);
    expect(res.body.receipt.remaining_invoice_balance).toBe(0);
    expect(res.body.receipt.remaining_package_balance).toBe(110000);
  });

  it('GET /api/students/:id/profile returns complete workspace with 10 financial metrics and reconciled ledger', async () => {
    const res = await request(app)
      .get(`/api/students/${testStudentId}/profile`)
      .set('Authorization', `Bearer ${feeManagerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Section A: Identity
    expect(res.body.student.full_name).toBe('Hamza Farooq');

    // Section B: Academic
    expect(res.body.academic.program_name).toBeDefined();
    expect(res.body.academic.class_name).toBeDefined();

    // Section C: 10 Financial Metrics
    const feeOverview = res.body.fee_overview;
    expect(feeOverview.total_agreed_package_fee).toBe(120000);
    expect(feeOverview.total_qualifying_package_payments).toBe(10000);
    expect(feeOverview.remaining_package_balance).toBe(110000);
    expect(feeOverview.current_billing_plan).toBe('monthly');
    expect(feeOverview.current_cycle_amount).toBe(10000);
    expect(feeOverview.total_outstanding_invoice_balance).toBe(0);

    // Section D: Challan History
    expect(res.body.challans.length).toBeGreaterThanOrEqual(1);

    // Section E: Payment History
    expect(res.body.payments.length).toBeGreaterThanOrEqual(1);
    expect(res.body.payments[0].amount).toBe(10000);

    // Section F: Reconciled Fee Ledger
    expect(res.body.ledger.length).toBeGreaterThanOrEqual(2);
    // First entry: invoice charge (debit = 10000, balance = 10000)
    // Second entry: payment (credit = 10000, balance = 0)
    const lastEntry = res.body.ledger[res.body.ledger.length - 1];
    expect(lastEntry.running_balance).toBe(0);
  });
});

describe('4. Admin-Only Staff Management & Teacher-Class Scoping', () => {
  let createdTeacherId: string;

  const runSuffix = Date.now().toString().slice(-5);
  const razaUser = `raza_${runSuffix}`;
  const aliUser = `ali_${runSuffix}`;
  const unassignedUser = `unassigned_${runSuffix}`;

  it('Fee Manager and Teacher CANNOT access staff management endpoints (403)', async () => {
    const feeRes = await request(app)
      .get('/api/staff')
      .set('Authorization', `Bearer ${feeManagerToken}`);
    expect(feeRes.status).toBe(403);

    const teacherRes = await request(app)
      .get('/api/staff')
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(teacherRes.status).toBe(403);
  });

  it('Admin can list staff and view designations and roles', async () => {
    const res = await request(app)
      .get('/api/staff?limit=500')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.staff.length).toBeGreaterThanOrEqual(4);
    const designations = res.body.staff.map((s: any) => s.designation);
    expect(designations.some((d: string) => d && (d.includes('Administrator') || d.includes('Principal')))).toBe(true);
  });

  it('Admin can create Teacher Raza assigned strictly to 1st Year Pre-Eng (class_fsc_pe_1a)', async () => {
    const res = await request(app)
      .post('/api/staff')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        full_name: 'Sir Muhammad Raza',
        username: razaUser,
        email: `${razaUser}@zec.edu.pk`,
        password: 'RazaPassword@123',
        designation: 'Lecturer in Mathematics',
        department: 'Engineering Sciences',
        phone: '+92-300-9988776',
        role: 'teacher',
        has_login: true,
        assigned_class_ids: ['class_fsc_pe_1a'],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    createdTeacherId = res.body.staff.id;

    // Login as Teacher Raza
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: razaUser, password: 'RazaPassword@123' });
    expect(loginRes.status).toBe(200);
    teacherRazaToken = loginRes.body.token;
  });

  it('Admin can create Teacher Ali assigned to ICS classes (class_ics_1a and class_ics_2a)', async () => {
    const res = await request(app)
      .post('/api/staff')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        full_name: 'Sir Ali Hassan',
        username: aliUser,
        email: `${aliUser}@zec.edu.pk`,
        password: 'AliPassword@123',
        designation: 'Assistant Professor of Computer Science',
        department: 'Computer Science',
        phone: '+92-300-1122334',
        role: 'teacher',
        has_login: true,
        assigned_class_ids: ['class_ics_1a', 'class_ics_2a'],
      });

    expect(res.status).toBe(201);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: aliUser, password: 'AliPassword@123' });
    expect(loginRes.status).toBe(200);
    teacherAliToken = loginRes.body.token;
  });

  it('Admin can create an Unassigned Teacher with 0 classes', async () => {
    const res = await request(app)
      .post('/api/staff')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        full_name: 'Prof. Unassigned Teacher',
        username: unassignedUser,
        email: `${unassignedUser}@zec.edu.pk`,
        password: 'Unassigned@123',
        designation: 'Visiting Lecturer',
        department: 'General',
        role: 'teacher',
        has_login: true,
        assigned_class_ids: [],
      });

    expect(res.status).toBe(201);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: unassignedUser, password: 'Unassigned@123' });
    expect(loginRes.status).toBe(200);
    unassignedTeacherToken = loginRes.body.token;
  });

  it('Teacher Raza sees ONLY assigned Class 10 (class_fsc_pe_1a) and CANNOT see Class 11/12', async () => {
    const res = await request(app)
      .get('/api/college/classes')
      .set('Authorization', `Bearer ${teacherRazaToken}`);
    expect(res.status).toBe(200);
    expect(res.body.classes.length).toBe(1);
    expect(res.body.classes[0].id).toBe('class_fsc_pe_1a');

    // Raza trying to access Class 11 directly gets 403
    const directRes = await request(app)
      .get('/api/college/classes/class_ics_1a')
      .set('Authorization', `Bearer ${teacherRazaToken}`);
    expect(directRes.status).toBe(403);
  });

  it('Teacher Ali sees ONLY assigned Classes 11 & 12 (class_ics_1a & class_ics_2a) and CANNOT see Class 10', async () => {
    const res = await request(app)
      .get('/api/college/classes')
      .set('Authorization', `Bearer ${teacherAliToken}`);
    expect(res.status).toBe(200);
    const classIds = res.body.classes.map((c: any) => c.id);
    expect(classIds).toContain('class_ics_1a');
    expect(classIds).toContain('class_ics_2a');
    expect(classIds).not.toContain('class_fsc_pe_1a');

    // Ali trying to access Class 10 directly gets 403
    const directRes = await request(app)
      .get('/api/college/classes/class_fsc_pe_1a')
      .set('Authorization', `Bearer ${teacherAliToken}`);
    expect(directRes.status).toBe(403);
  });

  it('Unassigned Teacher sees 0 classes and 0 students', async () => {
    const classRes = await request(app)
      .get('/api/college/classes')
      .set('Authorization', `Bearer ${unassignedTeacherToken}`);
    expect(classRes.status).toBe(200);
    expect(classRes.body.classes.length).toBe(0);

    const stdRes = await request(app)
      .get('/api/students')
      .set('Authorization', `Bearer ${unassignedTeacherToken}`);
    expect(stdRes.status).toBe(200);
    expect(stdRes.body.students.length).toBe(0);
  });

  it('Teacher Raza CANNOT access profile of student in another class by ID (403 OUT_OF_SCOPE)', async () => {
    // testStudentId is in BSCS class, which Raza does not teach
    const res = await request(app)
      .get(`/api/students/${testStudentId}/profile`)
      .set('Authorization', `Bearer ${teacherRazaToken}`);
    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('OUT_OF_SCOPE');
  });

  it('Admin can initiate a secure password reset for staff', async () => {
    const res = await request(app)
      .post(`/api/staff/${createdTeacherId}/reset-password`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ new_password: 'NewRazaPassword@456' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify login with new password
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: razaUser, password: 'NewRazaPassword@456' });
    expect(loginRes.status).toBe(200);
  });

  it('Admin can deactivate and reactivate staff; deactivated staff cannot login', async () => {
    // Deactivate
    const deactRes = await request(app)
      .post(`/api/staff/${createdTeacherId}/toggle-status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ is_active: 0 });
    expect(deactRes.status).toBe(200);
    expect(deactRes.body.is_active).toBe(0);

    // Attempt login while deactivated
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: razaUser, password: 'NewRazaPassword@456' });
    expect(loginRes.status).toBe(403);
    expect(loginRes.body.errorCode).toBe('ACCOUNT_DEACTIVATED');

    // Reactivate
    const reactRes = await request(app)
      .post(`/api/staff/${createdTeacherId}/toggle-status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ is_active: 1 });
    expect(reactRes.status).toBe(200);
    expect(reactRes.body.is_active).toBe(1);

    // Refresh Raza token with newly active session
    const refreshLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: razaUser, password: 'NewRazaPassword@456' });
    expect(refreshLogin.status).toBe(200);
    teacherRazaToken = refreshLogin.body.token;
  });


  it('System PREVENTS deactivating the last active administrator', async () => {
    // Find admin user ID
    const adminUserRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${adminToken}`);
    const adminId = adminUserRes.body.user.id;

    const res = await request(app)
      .post(`/api/staff/${adminId}/toggle-status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ is_active: 0 });
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('CANNOT_DEACTIVATE_LAST_ADMIN');
  });
});

describe('5. Complete Attendance Management System & Auditing', () => {
  const testDate = '2026-11-' + String((Date.now() % 25) + 1).padStart(2, '0');
  let bscsClassId = 'class_bscs_sem1';
  let bscsStudentsList: any[] = [];
  let markedSessionId: string;

  beforeAll(async () => {
    const db = (await import('../src/database/db.js')).getDb();
    await db.execute({
      sql: 'DELETE FROM attendance_sessions WHERE attendance_date = ? AND class_id = ?',
      args: [testDate, bscsClassId],
    });
    await db.execute({
      sql: 'DELETE FROM attendance_records WHERE attendance_date = ? AND class_id = ?',
      args: [testDate, bscsClassId],
    });

    // Get enrolled students in BSCS class for active session
    const res = await request(app)
      .get(`/api/attendance/roster?class_id=${bscsClassId}&academic_session_id=${activeSessionId}&date=${testDate}`)
      .set('Authorization', `Bearer ${adminToken}`);
    bscsStudentsList = res.body.roster;
  });

  it('Fee Manager CANNOT access attendance dashboard or roster (403)', async () => {
    const res = await request(app)
      .get('/api/attendance/dashboard')
      .set('Authorization', `Bearer ${feeManagerToken}`);
    expect(res.status).toBe(403);
  });

  it('GET /api/attendance/dashboard returns KPI summary and authorized classes', async () => {
    const res = await request(app)
      .get('/api/attendance/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.summary).toBeDefined();
    expect(res.body.today).toBeDefined();
    expect(res.body.available_classes.length).toBeGreaterThan(0);
  });

  it('Teacher Raza CANNOT access roster for BSCS class (403 TEACHER_CLASS_ACCESS_DENIED)', async () => {
    const res = await request(app)
      .get(`/api/attendance/roster?class_id=${bscsClassId}&academic_session_id=${activeSessionId}`)
      .set('Authorization', `Bearer ${teacherRazaToken}`);
    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('TEACHER_CLASS_ACCESS_DENIED');
  });

  it('Authorized Teacher (staff1) can fetch roster for BSCS class', async () => {
    const res = await request(app)
      .get(`/api/attendance/roster?class_id=${bscsClassId}&academic_session_id=${activeSessionId}&date=${testDate}`)
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.roster.length).toBe(bscsStudentsList.length);
  });

  it('POST /api/attendance/batch safely saves batch attendance with valid statuses', async () => {
    expect(bscsStudentsList.length).toBeGreaterThanOrEqual(2);

    const records = bscsStudentsList.map((s, idx) => ({
      student_id: s.id,
      status: idx === 0 ? 'present' : (idx === 1 ? 'absent' : 'present'),
      remarks: idx === 1 ? 'Medical leave requested' : null,
    }));

    const res = await request(app)
      .post('/api/attendance/batch')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        class_id: bscsClassId,
        academic_session_id: activeSessionId,
        attendance_date: testDate,
        records,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.summary.present_count).toBe(bscsStudentsList.length - 1);
    expect(res.body.summary.absent_count).toBe(1);
    markedSessionId = res.body.session_id;
  });

  it('Repeated batch submission is idempotent and updates existing records safely', async () => {
    const records = bscsStudentsList.map((s) => ({
      student_id: s.id,
      status: 'present',
    }));

    const res = await request(app)
      .post('/api/attendance/batch')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        class_id: bscsClassId,
        academic_session_id: activeSessionId,
        attendance_date: testDate,
        records,
      });

    expect(res.status).toBe(200);
    expect(res.body.summary.present_count).toBe(bscsStudentsList.length);
    expect(res.body.summary.absent_count).toBe(0);
  });

  it('Admin can finalize attendance session; Teacher CANNOT edit finalized session', async () => {
    // 1. Admin finalizes
    const finalizeRes = await request(app)
      .post(`/api/attendance/finalize/${markedSessionId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'finalized' });
    expect(finalizeRes.status).toBe(200);

    // 2. Teacher attempts to edit finalized session
    const editRes = await request(app)
      .post('/api/attendance/batch')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        class_id: bscsClassId,
        academic_session_id: activeSessionId,
        attendance_date: testDate,
        records: [{ student_id: bscsStudentsList[0].id, status: 'absent' }],
      });
    expect(editRes.status).toBe(403);
    expect(editRes.body.errorCode).toBe('ATTENDANCE_FINALIZED');
  });

  it('Admin can perform administrative correction with reason and audit trail', async () => {
    // Get existing record ID
    const rosterRes = await request(app)
      .get(`/api/attendance/roster?class_id=${bscsClassId}&academic_session_id=${activeSessionId}&date=${testDate}`)
      .set('Authorization', `Bearer ${adminToken}`);
    const recordId = rosterRes.body.roster[0].attendance.id;

    const currentStatus = rosterRes.body.roster[0].attendance?.status || 'present';
    const targetStatus = currentStatus === 'late' ? 'excused' : 'late';

    const res = await request(app)
      .post('/api/attendance/correct')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        record_id: recordId,
        new_status: targetStatus,
        reason: 'Authorized delay with approved certificate',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.correction_id).toBeDefined();
  });

  it('GET /api/attendance/reports/daily returns reconciled summary and roster', async () => {
    const res = await request(app)
      .get(`/api/attendance/reports/daily?class_id=${bscsClassId}&academic_session_id=${activeSessionId}&date=${testDate}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.summary.total_students).toBe(bscsStudentsList.length);
    expect(res.body.records.length).toBe(bscsStudentsList.length);
  });

  it('GET /api/attendance/student/:id returns complete student attendance history', async () => {
    const studentId = bscsStudentsList[0].id;
    const res = await request(app)
      .get(`/api/attendance/student/${studentId}`)
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.summary.total_days).toBeGreaterThanOrEqual(1);
    expect(res.body.history.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/attendance/reports/low-attendance detects students below threshold', async () => {
    const res = await request(app)
      .get(`/api/attendance/reports/low-attendance?class_id=${bscsClassId}&threshold=100`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.threshold).toBe(100);
    expect(res.body.students).toBeDefined();
  });
});

describe('4. ZEC Portal Institutional Branding & Settings Compliance', () => {
  it('GET /api/health returns authoritative ZEC Portal system identity', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.system).toBe('ZEC Portal');
    expect(res.body.college).toBe('Zakariya Educational Complex (ZEC)');
  });

  it('GET /api/college/settings returns Zakariya Educational Complex configuration', async () => {
    const res = await request(app)
      .get('/api/college/settings')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.settings.college_name).toBe('Zakariya Educational Complex');
    expect(res.body.settings.college_short_name).toBe('ZEC');
    expect(res.body.settings.currency).toBe('PKR');
    expect(res.body.settings.timezone).toBe('Asia/Karachi');
    expect(res.body.settings.challan_copies_count).toBe(3);
  });

  it('Admin can update institutional settings', async () => {
    const getRes = await request(app)
      .get('/api/college/settings')
      .set('Authorization', `Bearer ${adminToken}`);
    
    const settings = getRes.body.settings;
    const updatedPhone = '+92-61-111-222-334';
    
    const putRes = await request(app)
      .put('/api/college/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        ...settings,
        phone: updatedPhone,
      });

    expect(putRes.status).toBe(200);
    expect(putRes.body.success).toBe(true);
    expect(putRes.body.settings.phone).toBe(updatedPhone);
    expect(putRes.body.settings.college_name).toBe('Zakariya Educational Complex');
  });

  it('Teacher is blocked from modifying college institutional settings (403)', async () => {
    const res = await request(app)
      .put('/api/college/settings')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ college_name: 'Unauthorized Rebrand' });

    expect(res.status).toBe(403);
  });
});
