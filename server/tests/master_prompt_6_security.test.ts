import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { app } from '../src/index.js';
import { seedDatabase } from '../src/database/seed.js';
import { queryOne, getDatabaseFilePath } from '../src/database/db.js';

describe('MASTER PROMPT 6 — Security, Concurrency, Financial Integrity & Disaster Recovery', () => {
  let adminToken: string;
  let feeManagerToken: string;
  let teacherToken: string;
  let activeSessionId: string;
  let testClassId: string;
  let otherClassId: string;
  let testStudentRoll: string;
  let testStudentId: string;
  let otherStudentRoll: string;
  let createdTeacherId: string;
  let createdTeacherUsername: string;
  let initialTeacherToken: string;

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

    // 3. Fetch college sessions and classes
    const sessionRes = await request(app)
      .get('/api/college/sessions')
      .set('Authorization', `Bearer ${adminToken}`);
    activeSessionId = sessionRes.body.sessions[0].id;

    const classRes = await request(app)
      .get('/api/college/classes')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(classRes.body.classes.length).toBeGreaterThanOrEqual(2);
    testClassId = classRes.body.classes[0].id;
    otherClassId = classRes.body.classes[1].id;

    // 4. Create a dedicated teacher assigned strictly to testClassId
    createdTeacherUsername = `mp6_teacher_${Date.now()}`;
    const staffRes = await request(app)
      .post('/api/staff')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        full_name: 'MP6 Test Teacher',
        username: createdTeacherUsername,
        email: `${createdTeacherUsername}@zec.edu.pk`,
        password: 'Password@123',
        designation: 'Lecturer',
        department: 'Science',
        role: 'teacher',
        has_login: true,
        assigned_class_ids: [testClassId],
      });
    expect(staffRes.status).toBe(201);
    createdTeacherId = staffRes.body.staff.id;

    // Login as the created teacher
    const teacherLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: createdTeacherUsername, password: 'Password@123' });
    expect(teacherLogin.status).toBe(200);
    teacherToken = teacherLogin.body.token;
    initialTeacherToken = teacherLogin.body.token;

    // 5. Admit a student into testClassId
    testStudentRoll = `MP6-IN-${Date.now().toString().slice(-4)}`;
    const studentRes = await request(app)
      .post('/api/students/admit')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        roll_number: testStudentRoll,
        full_name: 'In-Scope Student',
        father_name: 'In-Scope Father',
        guardian_phone: '03001234567',
        program_id: 'prog_fsc_pm',
        class_id: testClassId,
        academic_session_id: activeSessionId,
        admission_date: '2026-09-01',
        total_package_fee: 60000,
      });
    expect(studentRes.status).toBe(201);
    testStudentId = studentRes.body.student.id;

    // 6. Admit a student into otherClassId
    otherStudentRoll = `MP6-OUT-${Date.now().toString().slice(-4)}`;
    const otherStudentRes = await request(app)
      .post('/api/students/admit')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        roll_number: otherStudentRoll,
        full_name: 'Out-of-Scope Student',
        father_name: 'Out-of-Scope Father',
        guardian_phone: '03009876543',
        program_id: 'prog_fsc_pm',
        class_id: otherClassId,
        academic_session_id: activeSessionId,
        admission_date: '2026-09-01',
        total_package_fee: 70000,
      });
    expect(otherStudentRes.status).toBe(201);
  });


  // =========================================================================
  // 1. AUTHENTICATION & ACCOUNT LOCKOUT CONTROLS
  // =========================================================================
  describe('Phase B: Authentication & Account Security', () => {
    it('Locks account after 5 consecutive failed login attempts (423 ACCOUNT_LOCKED)', async () => {
      const targetUser = createdTeacherUsername;

      // 4 failed attempts
      for (let i = 1; i <= 4; i++) {
        const failRes = await request(app)
          .post('/api/auth/login')
          .send({ username: targetUser, password: 'WrongPassword!999' });
        expect(failRes.status).toBe(401);
        expect(failRes.body.errorCode).toBe('INVALID_CREDENTIALS');
      }

      // 5th failed attempt triggers the lockout
      const fifthRes = await request(app)
        .post('/api/auth/login')
        .send({ username: targetUser, password: 'WrongPassword!999' });
      expect(fifthRes.status).toBe(423);
      expect(fifthRes.body.errorCode).toBe('ACCOUNT_LOCKED');
      expect(fifthRes.body.message).toMatch(/temporarily locked/i);

      // Subsequent attempt even with the CORRECT password is blocked while locked
      const blockedRes = await request(app)
        .post('/api/auth/login')
        .send({ username: targetUser, password: 'Password@123' });
      expect(blockedRes.status).toBe(423);
      expect(blockedRes.body.errorCode).toBe('ACCOUNT_LOCKED');
    });

    it('Admin can manually unlock a locked account via POST /api/staff/:id/unlock', async () => {
      const unlockRes = await request(app)
        .post(`/api/staff/${createdTeacherId}/unlock`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(unlockRes.status).toBe(200);
      expect(unlockRes.body.success).toBe(true);

      // Now login succeeds with the correct password
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ username: createdTeacherUsername, password: 'Password@123' });
      expect(loginRes.status).toBe(200);
      teacherToken = loginRes.body.token; // Refresh token
    });

    it('Enforces password complexity on change-password (min 8 chars, 1 letter, 1 number)', async () => {
      // Weak password: too short
      const weakRes1 = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ currentPassword: 'Password@123', newPassword: 'short' });
      expect(weakRes1.status).toBe(422);

      // Weak password: no numbers
      const weakRes2 = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ currentPassword: 'Password@123', newPassword: 'onlylettersallowed' });
      expect(weakRes2.status).toBe(422);
    });

    it('Password change increments token_version and invalidates previous session tokens', async () => {
      const oldToken = teacherToken;

      // Change password with valid complexity
      const changeRes = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${oldToken}`)
        .send({ currentPassword: 'Password@123', newPassword: 'NewStrongPassword@2026' });
      expect(changeRes.status).toBe(200);
      expect(changeRes.body.success).toBe(true);

      // Attempting to use the OLD token now receives 401 SESSION_REVOKED
      const staleRes = await request(app)
        .get('/api/college/classes')
        .set('Authorization', `Bearer ${oldToken}`);
      expect(staleRes.status).toBe(401);
      expect(staleRes.body.errorCode).toBe('SESSION_REVOKED');

      // Login with the new password yields a fresh active token
      const freshLogin = await request(app)
        .post('/api/auth/login')
        .send({ username: createdTeacherUsername, password: 'NewStrongPassword@2026' });
      expect(freshLogin.status).toBe(200);
      teacherToken = freshLogin.body.token;
    });

    it('POST /api/auth/logout revokes session server-side via token_version increment', async () => {
      const activeToken = teacherToken;

      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${activeToken}`);
      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.success).toBe(true);

      // Subsequent call with the logged-out token is rejected
      const revokedRes = await request(app)
        .get('/api/college/classes')
        .set('Authorization', `Bearer ${activeToken}`);
      expect(revokedRes.status).toBe(401);
      expect(revokedRes.body.errorCode).toBe('SESSION_REVOKED');

      // Re-login to have an active teacher token for subsequent tests
      const reLogin = await request(app)
        .post('/api/auth/login')
        .send({ username: createdTeacherUsername, password: 'NewStrongPassword@2026' });
      expect(reLogin.status).toBe(200);
      teacherToken = reLogin.body.token;
    });
  });


  // =========================================================================
  // 2. BACKEND AUTHORIZATION & IDOR SCOPING
  // =========================================================================
  describe('Phase C: Backend Authorization & IDOR Hardening', () => {
    it('Teacher lookup for student outside assigned class is blocked (403 OUT_OF_SCOPE)', async () => {
      const res = await request(app)
        .get(`/api/students/lookup/${otherStudentRoll}`)
        .set('Authorization', `Bearer ${teacherToken}`);
      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('OUT_OF_SCOPE');
    });

    it('Teacher lookup for student inside assigned class strictly redacts all financial data', async () => {
      const res = await request(app)
        .get(`/api/students/lookup/${testStudentRoll}`)
        .set('Authorization', `Bearer ${teacherToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.student.roll_number).toBe(testStudentRoll);

      // Verify financial fields are completely omitted/undefined
      expect(res.body.student.unpaidInvoices).toBeUndefined();
      expect(res.body.student.total_package_fee).toBeUndefined();
      expect(res.body.student.package_paid_to_date).toBeUndefined();
      expect(res.body.student.remaining_package_balance).toBeUndefined();
    });

    it('Fee Manager lookup for student returns full financial fields and invoices', async () => {
      const res = await request(app)
        .get(`/api/students/lookup/${testStudentRoll}`)
        .set('Authorization', `Bearer ${feeManagerToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.student.roll_number).toBe(testStudentRoll);
      expect(res.body.student.total_package_fee).toBeDefined();
      expect(res.body.student.remaining_package_balance).toBeDefined();
    });
  });

  // =========================================================================
  // 3. FINANCIAL TRANSACTION INTEGRITY & AUDITABLE REVERSALS
  // =========================================================================
  describe('Phase E: Financial Integrity & Auditable Reversals', () => {
    let generatedInvoiceId: string;
    let paymentId: string;
    const initialAmount = 10000;

    it('Generates a fee invoice and collects payment successfully', async () => {
      // 1. Generate Challan
      const challanRes = await request(app)
        .post('/api/challans/generate')
        .set('Authorization', `Bearer ${feeManagerToken}`)
        .send({
          scope: 'single_class',
          class_id: testClassId,
          academic_session_id: activeSessionId,
          billing_period: '2026-10',
          due_date: '2026-10-15',
        });
      expect(challanRes.status).toBe(200);

      // Find invoice for testStudentId
      const invoice = await queryOne(
        'SELECT * FROM fee_invoices WHERE student_id = ? AND academic_session_id = ? ORDER BY created_at DESC LIMIT 1',
        [testStudentId, activeSessionId]
      );
      expect(invoice).toBeDefined();
      generatedInvoiceId = invoice.id;
      const originalBalance = Number(invoice.remaining_invoice_balance);

      // 2. Post Payment of 15,000 PKR
      const idempotencyKey = `PAY-MP6-${Date.now()}`;
      const payRes = await request(app)
        .post('/api/payments/collect')
        .set('Authorization', `Bearer ${feeManagerToken}`)
        .send({
          invoice_id: generatedInvoiceId,
          amount: initialAmount,
          payment_method: 'cash',
          payment_date: '2026-10-05',
          idempotency_key: idempotencyKey,
          notes: 'MP6 Test Payment',
        });
      expect(payRes.status).toBe(201);
      paymentId = payRes.body.receipt.payment_id;

      // Verify invoice balance was decreased
      const updatedInvoice = await queryOne('SELECT * FROM fee_invoices WHERE id = ?', [generatedInvoiceId]);
      expect(Number(updatedInvoice.remaining_invoice_balance)).toBe(originalBalance - initialAmount);
    });

    it('Non-admin / unauthorized roles cannot reverse payments (403)', async () => {
      const unauthRes = await request(app)
        .post(`/api/payments/${paymentId}/reverse`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ reason: 'Unauthorized reversal attempt' });
      expect(unauthRes.status).toBe(403);
    });

    it('Admin can reverse payment, restoring invoice & package balances atomically', async () => {
      const invoiceBefore = await queryOne('SELECT * FROM fee_invoices WHERE id = ?', [generatedInvoiceId]);
      const balanceBefore = Number(invoiceBefore.remaining_invoice_balance);

      const revRes = await request(app)
        .post(`/api/payments/${paymentId}/reverse`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Bank transaction bounced / entry mistake' });
      expect(revRes.status).toBe(200);
      expect(revRes.body.success).toBe(true);
      expect(revRes.body.reversal.payment_id).toBe(paymentId);
      expect(revRes.body.reversal.new_invoice_balance).toBe(balanceBefore + initialAmount);

      // Verify invoice balance was completely restored
      const invoiceAfter = await queryOne('SELECT * FROM fee_invoices WHERE id = ?', [generatedInvoiceId]);
      expect(Number(invoiceAfter.remaining_invoice_balance)).toBe(balanceBefore + initialAmount);

      // Verify payment record has reversal metadata
      const paymentRecord = await queryOne('SELECT * FROM fee_payments WHERE id = ?', [paymentId]);
      expect(paymentRecord.is_reversed).toBe(1);
      expect(paymentRecord.reversal_reason).toBe('Bank transaction bounced / entry mistake');
    });

    it('Prevents double-reversal of an already reversed payment (400)', async () => {
      const duplicateRev = await request(app)
        .post(`/api/payments/${paymentId}/reverse`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Second reversal attempt' });
      expect(duplicateRev.status).toBe(400);
      expect(duplicateRev.body.errorCode).toBe('PAYMENT_ALREADY_REVERSED');
    });
  });

  // =========================================================================
  // 4. ATTENDANCE OPTIMISTIC CONCURRENCY CONTROL
  // =========================================================================
  describe('Phase F & G: Attendance Concurrency & Multi-Workstation Synchronization', () => {
    const testDate = '2026-10-25';

    it('Detects version conflicts when two workstations edit attendance concurrently', async () => {
      // 1. Workstation A marks initial batch attendance
      const submitA = await request(app)
        .post('/api/attendance/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Workstation-Id', 'WS-ROOM-101')
        .send({
          class_id: testClassId,
          academic_session_id: activeSessionId,
          attendance_date: testDate,
          records: [
            { student_id: testStudentId, status: 'present' },
          ],
        });
      expect(submitA.status).toBe(200);
      const currentVersion = submitA.body.version;
      expect(currentVersion).toBeGreaterThanOrEqual(1);

      // 2. Workstation B attempts to submit with a stale expected_version (e.g. 0 or currentVersion - 1)
      const staleVersion = currentVersion - 1;
      const conflictRes = await request(app)
        .post('/api/attendance/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Workstation-Id', 'WS-ROOM-102')
        .send({
          class_id: testClassId,
          academic_session_id: activeSessionId,
          attendance_date: testDate,
          expected_version: staleVersion,
          records: [
            { student_id: testStudentId, status: 'absent' },
          ],
        });
      expect(conflictRes.status).toBe(409);
      expect(conflictRes.body.errorCode).toBe('CONCURRENCY_CONFLICT');
      expect(conflictRes.body.details?.current_version).toBe(currentVersion);

      // 3. Workstation B accepts fresh version and successfully updates
      const resolvedRes = await request(app)
        .post('/api/attendance/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Workstation-Id', 'WS-ROOM-102')
        .send({
          class_id: testClassId,
          academic_session_id: activeSessionId,
          attendance_date: testDate,
          expected_version: currentVersion,
          records: [
            { student_id: testStudentId, status: 'excused' },
          ],
        });
      expect(resolvedRes.status).toBe(200);
      expect(resolvedRes.body.version).toBe(currentVersion + 1);
    });


  });

  // =========================================================================
  // 5. BACKUP & DISASTER RECOVERY PROCEDURES
  // =========================================================================
  describe('Phase H: Backup Creation, Integrity Verification & Safe Restore', () => {
    let createdBackupId: string;
    let backupFilePath: string;

    it('Admin can create a complete database backup with SHA-256 verification', async () => {
      const res = await request(app)
        .post('/api/backup/create')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ notes: 'Automated Master Prompt 6 Verification Backup' });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.sha256_hash).toMatch(/^[a-f0-9]{64}$/i);
      expect(res.body.data.record_counts.students).toBeGreaterThan(0);

      createdBackupId = res.body.data.id;
      backupFilePath = res.body.data.file_path;

      // Verify file exists on disk along with detached .sha256 checksum
      expect(fs.existsSync(backupFilePath)).toBe(true);
      expect(fs.existsSync(`${backupFilePath}.sha256`)).toBe(true);
    });

    it('Verifies backup SHA-256 and executes SQLite PRAGMA integrity_check', async () => {
      const verifyRes = await request(app)
        .post(`/api/backup/verify/${createdBackupId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.success).toBe(true);
      expect(verifyRes.body.data.hash_match).toBe(true);
      expect(verifyRes.body.data.sqlite_integrity).toBe('ok');
    });

    it('Lists available backups with disk status and creator details', async () => {
      const listRes = await request(app)
        .get('/api/backup')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.success).toBe(true);
      expect(listRes.body.data.length).toBeGreaterThan(0);

      const found = listRes.body.data.find((b: any) => b.id === createdBackupId);
      expect(found).toBeDefined();
      expect(found.exists_on_disk).toBe(true);
    });

    it('Restores database safely with automatic pre-restore safety snapshot (Admin only)', async () => {
      // 1. Attempting restore without confirm: true is rejected
      const unconfirmedRes = await request(app)
        .post(`/api/backup/restore/${createdBackupId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ confirm: false });
      expect(unconfirmedRes.status).toBe(400);
      expect(unconfirmedRes.body.errorCode).toBe('RESTORE_CONFIRMATION_REQUIRED');

      // 2. Perform restore with confirm: true
      const restoreRes = await request(app)
        .post(`/api/backup/restore/${createdBackupId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ confirm: true });
      expect(restoreRes.status).toBe(200);
      expect(restoreRes.body.success).toBe(true);
      expect(restoreRes.body.data.safety_backup).toBeDefined();
      expect(restoreRes.body.data.integrity_status).toBe('ok');
      expect(restoreRes.body.data.foreign_key_violations).toBe(0);

      // Verify safety backup was recorded and exists on disk
      expect(restoreRes.body.data.safety_backup.filename).toMatch(/zec_backup_/);
    });
  });

  // =========================================================================
  // 6. DESKTOP & TAURI SECURITY VERIFICATION
  // =========================================================================
  describe('Phase J: Tauri & Desktop Client Security Review', () => {
    it('Verifies tauri.conf.json does not leak database credentials or remote secrets', () => {
      const tauriConfigPath = path.resolve(process.cwd(), '../src-tauri/tauri.conf.json');
      if (fs.existsSync(tauriConfigPath)) {
        const content = fs.readFileSync(tauriConfigPath, 'utf-8');
        expect(content).not.toMatch(/libsql:\/\//i);
        expect(content).not.toMatch(/TURSO_AUTH_TOKEN/i);
        expect(content).not.toMatch(/JWT_SECRET/i);
      }
    });

    it('Verifies environment variables keep privileged secrets on backend only', () => {
      const envPath = path.resolve(process.cwd(), '../.env');
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf-8');
        // VITE_ prefixed variables are exposed to frontend; ensure no database passwords or JWT secrets have VITE_ prefix
        expect(content).not.toMatch(/VITE_JWT_SECRET/i);
        expect(content).not.toMatch(/VITE_DB_PASSWORD/i);
        expect(content).not.toMatch(/VITE_TURSO_AUTH_TOKEN/i);
      }
    });
  });
});
