import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb, query, queryAll } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function cleanSqlStatements(sql: string): string[] {
  const lines = sql.split('\n');
  const cleanedLines = lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('--')) return '';
    const commentIdx = line.indexOf('--');
    if (commentIdx >= 0) {
      return line.substring(0, commentIdx);
    }
    return line;
  });
  
  return cleanedLines
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export async function runMigrations() {
  console.log('🔄 Checking and applying database migrations...');
  const db = getDb();

  // 1. Ensure schema_migrations table exists
  await db.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 2. Read schema.sql
  const schemaPath = path.resolve(__dirname, '../../../database/schema/schema.sql');
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Schema file not found at: ${schemaPath}`);
  }

  const schemaSql = fs.readFileSync(schemaPath, 'utf-8');

  // Check if initial schema migration already applied
  const existing = await query('SELECT id FROM schema_migrations WHERE version = ?', ['001_initial_schema']);
  if (existing.rows.length === 0) {
    console.log('📦 Applying 001_initial_schema...');
    
    const statements = cleanSqlStatements(schemaSql);

    for (const statement of statements) {
      try {
        await db.execute(statement);
      } catch (err: any) {
        console.error(`❌ Migration error on statement: ${statement.substring(0, 100)}...`);
        console.error(err.message);
        throw err;
      }
    }

    await db.execute({
      sql: 'INSERT INTO schema_migrations (version, name) VALUES (?, ?)',
      args: ['001_initial_schema', 'Initial production schema for ZEC AcademiaFee Pro'],
    });

    console.log('✅ 001_initial_schema applied successfully.');
  }

  // 3. Migration 002: Role Restructuring & Performance Indexing
  const migration002 = await query('SELECT id FROM schema_migrations WHERE version = ?', ['002_role_restructuring']);
  if (migration002.rows.length === 0) {
    console.log('📦 Applying 002_role_restructuring...');

    // Disable foreign keys temporarily for table rebuild
    await db.execute('PRAGMA foreign_keys = OFF;');

    // A. Rebuild users table with strictly admin, fee_manager, teacher
    await db.execute(`
      CREATE TABLE IF NOT EXISTS users_v2 (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        full_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'fee_manager', 'teacher')),
        is_active INTEGER NOT NULL DEFAULT 1,
        last_login_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Migrate existing users: cashier -> fee_manager, staff/auditor -> teacher
    await db.execute(`
      INSERT INTO users_v2 (id, username, email, full_name, password_hash, role, is_active, last_login_at, created_at, updated_at)
      SELECT 
        id, username, email, full_name, password_hash,
        CASE 
          WHEN role = 'admin' THEN 'admin'
          WHEN role IN ('fee_manager', 'cashier') THEN 'fee_manager'
          WHEN role IN ('teacher', 'office_staff', 'auditor') THEN 'teacher'
          ELSE 'teacher'
        END as role,
        is_active, last_login_at, created_at, updated_at
      FROM users;
    `);

    await db.execute('DROP TABLE users;');
    await db.execute('ALTER TABLE users_v2 RENAME TO users;');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);');

    // Re-enable foreign keys
    await db.execute('PRAGMA foreign_keys = ON;');

    // B. Ensure all base permissions exist in permissions table
    const basePermissions = [
      { code: 'auth:manage_users', name: 'Manage Staff Accounts', category: 'Authentication', description: 'Create and edit staff users' },
      { code: 'college:manage_settings', name: 'Manage College Settings', category: 'Administration', description: 'Configure college info and branding' },
      { code: 'academic:manage', name: 'Manage Academic Structure', category: 'Academic', description: 'Manage sessions, programs and classes' },
      { code: 'academic:read', name: 'View Academic Structure', category: 'Academic', description: 'View sessions, programs and classes' },
      { code: 'students:read', name: 'View Students', category: 'Students', description: 'View student directory and fee ledgers' },
      { code: 'students:create', name: 'Register Student', category: 'Students', description: 'Admit new students' },
      { code: 'students:update', name: 'Update Student', category: 'Students', description: 'Edit student profile and class' },
      { code: 'students:delete', name: 'Delete Student', category: 'Students', description: 'Deactivate or withdraw students' },
      { code: 'fee:manage_structure', name: 'Manage Fee Structures', category: 'Fee', description: 'Configure standard fee heads and amounts' },
      { code: 'fee:manage_plans', name: 'Manage Student Fee Plans', category: 'Fee', description: 'Assign packages, installments and discounts' },
      { code: 'fee:adjust', name: 'Authorize Fee Adjustments', category: 'Fee', description: 'Approve scholarships, waivers and fines' },
      { code: 'challan:generate', name: 'Generate Challans', category: 'Challan', description: 'Run bulk and individual challan generation' },
      { code: 'challan:cancel', name: 'Cancel/Void Challan', category: 'Challan', description: 'Void unpaid challans' },
      { code: 'payment:collect', name: 'Collect Payments', category: 'Cashier', description: 'Accept full/partial payments and issue receipts' },
      { code: 'payment:refund', name: 'Authorize Refunds', category: 'Cashier', description: 'Process payment reversals and refunds' },
      { code: 'reports:view', name: 'View Reports', category: 'Reports', description: 'Access financial dashboard and defaulters report' },
      { code: 'audit:view', name: 'View Audit Logs', category: 'Security', description: 'Inspect system and security audit trails' },
      { code: 'backup:manage', name: 'Manage Backups', category: 'System', description: 'Create and restore system backups' },
    ];
    for (const perm of basePermissions) {
      await db.execute({
        sql: `INSERT OR IGNORE INTO permissions (id, code, name, category, description) VALUES (?, ?, ?, ?, ?)`,
        args: [`perm_${perm.code}`, perm.code, perm.name, perm.category, perm.description],
      });
    }

    // C. Clean up obsolete role permissions
    await db.execute(`DELETE FROM role_permissions WHERE role NOT IN ('admin', 'fee_manager', 'teacher');`);

    // D. Re-seed permissions for fee_manager and teacher
    const feeManagerPerms = [
      'academic:manage',
      'academic:read',
      'students:read',
      'students:update',
      'fee:manage_structure',
      'fee:manage_plans',
      'fee:adjust',
      'challan:generate',
      'challan:cancel',
      'payment:collect',
      'reports:view',
    ];
    for (const code of feeManagerPerms) {
      await db.execute({
        sql: 'INSERT OR IGNORE INTO role_permissions (role, permission_code) VALUES (?, ?)',
        args: ['fee_manager', code],
      });
    }

    const teacherPerms = [
      'students:read',
      'academic:read',
    ];
    for (const code of teacherPerms) {
      await db.execute({
        sql: 'INSERT OR IGNORE INTO role_permissions (role, permission_code) VALUES (?, ?)',
        args: ['teacher', code],
      });
    }

    // E. Create teacher_classes table for teacher assigned academic scopes
    await db.execute(`
      CREATE TABLE IF NOT EXISTS teacher_classes (
        id TEXT PRIMARY KEY,
        teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        academic_session_id TEXT NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(teacher_id, class_id)
      );
    `);
    await db.execute('CREATE INDEX IF NOT EXISTS idx_teacher_classes_teacher ON teacher_classes(teacher_id);');

    // F. Indexes for high-speed student search
    await db.execute('CREATE INDEX IF NOT EXISTS idx_students_full_name ON students(full_name);');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_students_father_name ON students(father_name);');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_students_phone ON students(guardian_phone);');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_students_prog_sess ON students(program_id, academic_session_id);');

    // Record migration
    await db.execute({
      sql: 'INSERT INTO schema_migrations (version, name) VALUES (?, ?)',
      args: ['002_role_restructuring', 'Role Restructuring (Admin, Fee Manager, Teacher), Teacher Classes & Search Indexing'],
    });

    console.log('✅ 002_role_restructuring applied successfully.');
  }

  // 4. Migration 003: Staff Profile Management & Complete Attendance System
  const migration003 = await query('SELECT id FROM schema_migrations WHERE version = ?', ['003_staff_and_attendance']);
  if (migration003.rows.length === 0) {
    console.log('📦 Applying 003_staff_and_attendance...');

    // A. Add staff profile columns to users table
    const userColumns = await queryAll('PRAGMA table_info(users)');
    const colNames = new Set(userColumns.map((c: any) => c.name));

    const alterCols = [
      { name: 'employee_id', type: 'TEXT' },
      { name: 'designation', type: "TEXT DEFAULT 'Staff'" },
      { name: 'department', type: 'TEXT' },
      { name: 'phone', type: 'TEXT' },
      { name: 'address', type: 'TEXT' },
      { name: 'joining_date', type: 'TEXT' },
      { name: 'employment_status', type: "TEXT DEFAULT 'active'" },
      { name: 'notes', type: 'TEXT' },
      { name: 'has_login', type: 'INTEGER DEFAULT 1' },
    ];

    for (const col of alterCols) {
      if (!colNames.has(col.name)) {
        await db.execute(`ALTER TABLE users ADD COLUMN ${col.name} ${col.type};`);
      }
    }

    await db.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_employee_id ON users(employee_id) WHERE employee_id IS NOT NULL;');

    // B. Add tracking columns to teacher_classes table
    const tcColumns = await queryAll('PRAGMA table_info(teacher_classes)');
    const tcColNames = new Set(tcColumns.map((c: any) => c.name));

    const tcAlterCols = [
      { name: 'assigned_by_user_id', type: 'TEXT' },
      { name: 'effective_from', type: 'TEXT' },
      { name: 'effective_until', type: 'TEXT' },
      { name: 'is_active', type: 'INTEGER DEFAULT 1' },
    ];

    for (const col of tcAlterCols) {
      if (!tcColNames.has(col.name)) {
        await db.execute(`ALTER TABLE teacher_classes ADD COLUMN ${col.name} ${col.type};`);
      }
    }

    // C. Create attendance_sessions header table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS attendance_sessions (
        id TEXT PRIMARY KEY,
        class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
        academic_session_id TEXT NOT NULL REFERENCES academic_sessions(id) ON DELETE RESTRICT,
        attendance_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft', 'submitted', 'finalized')),
        total_enrolled INTEGER NOT NULL DEFAULT 0,
        present_count INTEGER NOT NULL DEFAULT 0,
        absent_count INTEGER NOT NULL DEFAULT 0,
        late_count INTEGER NOT NULL DEFAULT 0,
        excused_count INTEGER NOT NULL DEFAULT 0,
        marked_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        marked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        finalized_by_user_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
        finalized_at TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(class_id, academic_session_id, attendance_date)
      );
    `);

    // D. Create attendance_records detail table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS attendance_records (
        id TEXT PRIMARY KEY,
        attendance_session_id TEXT NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
        student_id TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
        class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
        academic_session_id TEXT NOT NULL REFERENCES academic_sessions(id) ON DELETE RESTRICT,
        attendance_date TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'late', 'excused')),
        remarks TEXT,
        marked_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        marked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_by_user_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(student_id, attendance_date)
      );
    `);

    // E. Create attendance_corrections audit table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS attendance_corrections (
        id TEXT PRIMARY KEY,
        attendance_record_id TEXT NOT NULL REFERENCES attendance_records(id) ON DELETE CASCADE,
        student_id TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
        attendance_date TEXT NOT NULL,
        old_status TEXT NOT NULL,
        new_status TEXT NOT NULL,
        reason TEXT NOT NULL,
        corrected_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        corrected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // F. Performance Indexes for Attendance & Staff
    await db.execute('CREATE INDEX IF NOT EXISTS idx_att_sess_class_date ON attendance_sessions(class_id, attendance_date);');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_att_sess_session_date ON attendance_sessions(academic_session_id, attendance_date);');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_att_rec_student_date ON attendance_records(student_id, attendance_date);');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_att_rec_class_date ON attendance_records(class_id, attendance_date);');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_att_rec_session ON attendance_records(attendance_session_id);');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_att_corrections_student ON attendance_corrections(student_id);');

    // G. Seed Attendance Permissions
    const attPermissions = [
      { code: 'attendance:mark', name: 'Mark Class Attendance', category: 'Attendance', description: 'Mark daily student attendance for assigned classes' },
      { code: 'attendance:view', name: 'View Attendance Records', category: 'Attendance', description: 'View daily, monthly and historical attendance' },
      { code: 'attendance:manage', name: 'Manage & Correct Attendance', category: 'Attendance', description: 'Finalize, reopen and administratively correct attendance' },
      { code: 'staff:manage', name: 'Manage Staff Profiles', category: 'Staff', description: 'Create and administer employee records and teacher assignments' },
    ];

    for (const perm of attPermissions) {
      await db.execute({
        sql: `INSERT OR IGNORE INTO permissions (id, code, name, category, description) VALUES (?, ?, ?, ?, ?)`,
        args: [`perm_${perm.code}`, perm.code, perm.name, perm.category, perm.description],
      });
    }

    // Role permissions mapping for attendance & staff
    const adminPerms = ['attendance:mark', 'attendance:view', 'attendance:manage', 'staff:manage'];
    for (const code of adminPerms) {
      await db.execute({
        sql: 'INSERT OR IGNORE INTO role_permissions (role, permission_code) VALUES (?, ?)',
        args: ['admin', code],
      });
    }

    const teacherPerms = ['attendance:mark', 'attendance:view'];
    for (const code of teacherPerms) {
      await db.execute({
        sql: 'INSERT OR IGNORE INTO role_permissions (role, permission_code) VALUES (?, ?)',
        args: ['teacher', code],
      });
    }

    // Record migration 003
    await db.execute({
      sql: 'INSERT INTO schema_migrations (version, name) VALUES (?, ?)',
      args: ['003_staff_and_attendance', 'Staff Profile Management, Teacher-Class Scoping & Complete Attendance System'],
    });

    console.log('✅ 003_staff_and_attendance applied successfully.');
  }

  // 4. Migration 004: Security Hardening, Lockouts, Payment Reversals & Backups
  const migration004 = await query('SELECT id FROM schema_migrations WHERE version = ?', ['004_security_hardening_and_backups']);
  if (migration004.rows.length === 0) {
    console.log('📦 Applying 004_security_hardening_and_backups...');

    // A. Add security columns to users table
    const userColumns = await queryAll('PRAGMA table_info(users)');
    const userColNames = new Set(userColumns.map((c: any) => c.name));

    const userSecurityCols = [
      { name: 'failed_login_attempts', type: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'locked_until', type: 'TEXT DEFAULT NULL' },
      { name: 'token_version', type: 'INTEGER NOT NULL DEFAULT 1' },
      { name: 'password_changed_at', type: 'TEXT DEFAULT NULL' },
    ];

    for (const col of userSecurityCols) {
      if (!userColNames.has(col.name)) {
        await db.execute(`ALTER TABLE users ADD COLUMN ${col.name} ${col.type};`);
      }
    }

    // B. Add reversal columns to fee_payments table
    const paymentColumns = await queryAll('PRAGMA table_info(fee_payments)');
    const paymentColNames = new Set(paymentColumns.map((c: any) => c.name));

    const paymentReversalCols = [
      { name: 'is_reversed', type: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'reversed_at', type: 'TEXT DEFAULT NULL' },
      { name: 'reversed_by', type: 'TEXT DEFAULT NULL' },
      { name: 'reversal_reason', type: 'TEXT DEFAULT NULL' },
    ];

    for (const col of paymentReversalCols) {
      if (!paymentColNames.has(col.name)) {
        await db.execute(`ALTER TABLE fee_payments ADD COLUMN ${col.name} ${col.type};`);
      }
    }

    // C. Add version column to attendance_sessions for concurrency conflict detection
    const attSessColumns = await queryAll('PRAGMA table_info(attendance_sessions)');
    const attSessColNames = new Set(attSessColumns.map((c: any) => c.name));
    if (!attSessColNames.has('version')) {
      await db.execute('ALTER TABLE attendance_sessions ADD COLUMN version INTEGER NOT NULL DEFAULT 1;');
    }

    // D. Create system_backups table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS system_backups (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL UNIQUE,
        file_path TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        sha256_hash TEXT NOT NULL,
        record_counts_json TEXT NOT NULL,
        created_by TEXT NOT NULL REFERENCES users(id),
        status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'failed', 'restoring')),
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await db.execute('CREATE INDEX IF NOT EXISTS idx_backups_created ON system_backups(created_at DESC);');

    // E. Ensure permissions for backups and refunds
    const securityPerms = [
      { code: 'backup:manage', name: 'Manage System Backups & Recovery', category: 'System', description: 'Create, verify and restore system backups' },
      { code: 'payment:refund', name: 'Authorize Payment Reversals', category: 'Cashier', description: 'Authorize and execute payment reversals' },
    ];

    for (const perm of securityPerms) {
      await db.execute({
        sql: `INSERT OR IGNORE INTO permissions (id, code, name, category, description) VALUES (?, ?, ?, ?, ?)`,
        args: [`perm_${perm.code}`, perm.code, perm.name, perm.category, perm.description],
      });
      await db.execute({
        sql: 'INSERT OR IGNORE INTO role_permissions (role, permission_code) VALUES (?, ?)',
        args: ['admin', perm.code],
      });
    }

    // Record migration 004
    await db.execute({
      sql: 'INSERT INTO schema_migrations (version, name) VALUES (?, ?)',
      args: ['004_security_hardening_and_backups', 'Account Lockout, Session Revocation, Concurrency, Payment Reversals and Backups'],
    });

    console.log('✅ 004_security_hardening_and_backups applied successfully.');
  } else {
    console.log('✅ Schema is up-to-date.');
  }
}

// Allow direct execution
if (process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js')) {
  runMigrations()
    .then(() => {
      console.log('🎉 Migration completed successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('💥 Migration failed:', err);
      process.exit(1);
    });
}
