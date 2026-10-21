import { getDb, query } from './db.js';
import { hashPassword } from '../utils/security.js';
import { runMigrations } from './migrate.js';

export async function seedDatabase() {
  console.log('🌱 Starting database seeding for Zakariya Educational Complex (ZEC)...');
  await runMigrations();
  const db = getDb();

  // 1. Seed College Settings
  const settingsCount = await query('SELECT COUNT(*) as count FROM college_settings');
  if (Number(settingsCount.rows[0].count) === 0) {
    await db.execute({
      sql: `INSERT INTO college_settings (
        id, college_name, college_short_name, logo_url, address, phone, email, website,
        bank_name, bank_branch, bank_account_title, bank_account_no, bank_iban,
        payment_instructions, currency, default_due_day, late_fine_per_day, timezone
      ) VALUES (
        'settings_zec_main', 'Zakariya Educational Complex', 'ZEC', '/zec_college_logo.jpg',
        'Main Campus, Multan Road, Pakistan', '+92-61-111-222-333', 'admissions@zec.edu.pk', 'https://zec.edu.pk',
        'Habib Bank Limited (HBL) / Bank of Punjab (BOP)', 'Cantt Branch, Multan',
        'Zakariya Educational Complex Fee Collection A/C', '0142-79012345-03', 'PK36HABB0001427901234503',
        'Fee must be deposited in any online branch of HBL/BOP before due date. Late fine of Rs. 20/day will be levied after due date.',
        'PKR', 10, 20, 'Asia/Karachi'
      )`,
      args: [],
    });
    console.log('✅ College settings seeded.');
  }

  // 2. Seed Permissions
  const permissionsList = [
    { code: 'auth:manage_users', name: 'Manage Staff Accounts', category: 'Authentication', description: 'Create and edit staff users' },
    { code: 'college:manage_settings', name: 'Manage College Settings', category: 'Administration', description: 'Configure college info and branding' },
    { code: 'academic:manage', name: 'Manage Academic Structure', category: 'Academic', description: 'Manage sessions, programs and classes' },
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

  for (const perm of permissionsList) {
    await db.execute({
      sql: `INSERT OR IGNORE INTO permissions (id, code, name, category, description) VALUES (?, ?, ?, ?, ?)`,
      args: [`perm_${perm.code}`, perm.code, perm.name, perm.category, perm.description],
    });
  }

  // 3. Seed Role Permissions (Strictly Admin, Fee Manager, Teacher)
  const roleMapping: Record<string, string[]> = {
    admin: permissionsList.map((p) => p.code),
    fee_manager: [
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
    ],
    teacher: [
      'students:read',
      'academic:read',
    ],
  };

  // Clean out any stale roles
  await db.execute("DELETE FROM role_permissions WHERE role NOT IN ('admin', 'fee_manager', 'teacher')");

  for (const [role, perms] of Object.entries(roleMapping)) {
    for (const permCode of perms) {
      await db.execute({
        sql: `INSERT OR IGNORE INTO role_permissions (role, permission_code) VALUES (?, ?)`,
        args: [role, permCode],
      });
    }
  }

  // 4. Seed Default Users (Admin, Fee Manager, Teacher)
  const defaultUsers = [
    {
      id: 'usr_admin',
      username: 'admin',
      email: 'admin@zec.edu.pk',
      full_name: 'Dr. Rehan Mughal (Principal & Administrator)',
      employee_id: 'EMP-001',
      designation: 'Principal & Chief Administrator',
      department: 'Administration',
      phone: '+92-300-1112223',
      address: 'Staff Colony, Campus A, Multan',
      joining_date: '2020-01-15',
      password: 'Admin@123',
      role: 'admin',
      has_login: 1,
    },
    {
      id: 'usr_feemanager',
      username: 'feemanager',
      email: 'feemanager@zec.edu.pk',
      full_name: 'Muhammad Tariq (Chief Fee Manager)',
      employee_id: 'EMP-002',
      designation: 'Head of Accounts & Fee Manager',
      department: 'Accounts & Finance',
      phone: '+92-300-2223334',
      address: 'Shah Rukn-e-Alam, Multan',
      joining_date: '2021-03-01',
      password: 'Manager@123',
      role: 'fee_manager',
      has_login: 1,
    },
    {
      id: 'usr_cashier1',
      username: 'cashier1',
      email: 'cashier1@zec.edu.pk',
      full_name: 'Bilal Ahmad (Assistant Fee Manager)',
      employee_id: 'EMP-003',
      designation: 'Accountant & Assistant Fee Manager',
      department: 'Accounts & Finance',
      phone: '+92-300-3334445',
      address: 'Gulgasht Colony, Multan',
      joining_date: '2022-06-10',
      password: 'Cashier@123',
      role: 'fee_manager',
      has_login: 1,
    },
    {
      id: 'usr_staff1',
      username: 'staff1',
      email: 'teacher1@zec.edu.pk',
      full_name: 'Prof. Ayesha Khan (Department of CS)',
      employee_id: 'EMP-004',
      designation: 'Senior Lecturer in Computer Science',
      department: 'Computer Science',
      phone: '+92-300-4445556',
      address: 'Cantt View, Multan',
      joining_date: '2021-09-01',
      password: 'Staff@123',
      role: 'teacher',
      has_login: 1,
    },
    {
      id: 'usr_teacher_ali',
      username: 'teacher_ali',
      email: 'ali.raza@zec.edu.pk',
      full_name: 'Sir Ali Raza (Department of Science)',
      employee_id: 'EMP-005',
      designation: 'Lecturer in Physics & Math',
      department: 'Natural Sciences',
      phone: '+92-300-5556667',
      address: 'Bosan Road, Multan',
      joining_date: '2023-01-10',
      password: 'Teacher@123',
      role: 'teacher',
      has_login: 1,
    },
    {
      id: 'usr_librarian',
      username: 'librarian_zahid',
      email: 'library@zec.edu.pk',
      full_name: 'Zahid Mehmood (Head Librarian)',
      employee_id: 'EMP-006',
      designation: 'Head Librarian',
      department: 'Central Library',
      phone: '+92-300-6667778',
      address: 'Officers Colony, Multan',
      joining_date: '2022-01-05',
      password: 'Worker@123',
      role: 'teacher',
      has_login: 0,
    },
    {
      id: 'usr_lab_asst',
      username: 'lab_tariq',
      email: 'labs@zec.edu.pk',
      full_name: 'Tariq Aziz (Senior Lab Assistant)',
      employee_id: 'EMP-007',
      designation: 'Senior Lab Assistant',
      department: 'Science Laboratories',
      phone: '+92-300-7778889',
      address: 'Mumtazabad, Multan',
      joining_date: '2022-08-15',
      password: 'Worker@123',
      role: 'teacher',
      has_login: 0,
    },
    {
      id: 'usr_security',
      username: 'security_ghaffar',
      email: 'security@zec.edu.pk',
      full_name: 'Abdul Ghaffar (Security Supervisor)',
      employee_id: 'EMP-008',
      designation: 'Security Supervisor',
      department: 'Security & Campus Safety',
      phone: '+92-300-8889990',
      address: 'Main Gate Complex, Multan',
      joining_date: '2019-11-01',
      password: 'Worker@123',
      role: 'teacher',
      has_login: 0,
    },
  ];

  for (const u of defaultUsers) {
    const existing = await query('SELECT id, role FROM users WHERE username = ?', [u.username]);
    if (existing.rows.length === 0) {
      const hash = await hashPassword(u.password);
      await db.execute({
        sql: `INSERT INTO users (
          id, username, email, full_name, password_hash, role, is_active,
          employee_id, designation, department, phone, address, joining_date, has_login
        ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          u.id, u.username, u.email, u.full_name, hash, u.role,
          u.employee_id, u.designation, u.department, u.phone, u.address, u.joining_date, u.has_login
        ],
      });
      console.log(`✅ User seeded: ${u.username} (${u.role})`);
    } else {
      const hash = await hashPassword(u.password);
      await db.execute({
        sql: `UPDATE users SET 
          role = ?, full_name = ?, password_hash = ?, employee_id = ?, designation = ?, 
          department = ?, phone = ?, address = ?, joining_date = ?, has_login = ?
        WHERE id = ?`,
        args: [
          u.role, u.full_name, hash, u.employee_id, u.designation,
          u.department, u.phone, u.address, u.joining_date, u.has_login,
          existing.rows[0].id
        ],
      });
    }
  }

  // 5. Seed Academic Sessions
  const sessionActiveId = 'sess_2025_2026';
  await db.execute({
    sql: `INSERT OR IGNORE INTO academic_sessions (id, name, start_date, end_date, is_active, status)
          VALUES (?, '2025-2026', '2025-08-01', '2026-06-30', 1, 'active')`,
    args: [sessionActiveId],
  });

  await db.execute({
    sql: `INSERT OR IGNORE INTO academic_sessions (id, name, start_date, end_date, is_active, status)
          VALUES ('sess_2026_2027', '2026-2027', '2026-08-01', '2027-06-30', 0, 'upcoming')`,
    args: [],
  });

  // 6. Seed Programs
  const programs = [
    { id: 'prog_fsc_pm', name: 'FSc Pre-Medical', code: 'FSC-PM', duration: 2 },
    { id: 'prog_fsc_pe', name: 'FSc Pre-Engineering', code: 'FSC-PE', duration: 2 },
    { id: 'prog_ics', name: 'ICS (Computer Science)', code: 'ICS', duration: 2 },
    { id: 'prog_icom', name: 'I.Com (Commerce)', code: 'ICOM', duration: 2 },
    { id: 'prog_bscs', name: 'BS Computer Science', code: 'BSCS', duration: 4 },
  ];

  for (const prog of programs) {
    await db.execute({
      sql: `INSERT OR IGNORE INTO programs (id, name, code, duration_years, status)
            VALUES (?, ?, ?, ?, 'active')`,
      args: [prog.id, prog.name, prog.code, prog.duration],
    });
  }

  // 7. Seed Classes
  const classes = [
    { id: 'class_fsc_pm_1a', name: '1st Year Pre-Med (Section A)', prog_id: 'prog_fsc_pm', fee: 10000 },
    { id: 'class_fsc_pe_1a', name: '1st Year Pre-Eng (Section A)', prog_id: 'prog_fsc_pe', fee: 10000 },
    { id: 'class_ics_1a', name: '1st Year ICS (Section A)', prog_id: 'prog_ics', fee: 9500 },
    { id: 'class_ics_2a', name: '2nd Year ICS (Section A)', prog_id: 'prog_ics', fee: 9500 },
    { id: 'class_icom_1a', name: '1st Year I.Com (Section A)', prog_id: 'prog_icom', fee: 8500 },
    { id: 'class_bscs_sem1', name: 'BSCS (Semester 1)', prog_id: 'prog_bscs', fee: 15000 },
  ];

  for (const cls of classes) {
    await db.execute({
      sql: `INSERT OR IGNORE INTO classes (id, name, program_id, academic_session_id, section, default_monthly_fee, status)
            VALUES (?, ?, ?, ?, 'A', ?, 'active')`,
      args: [cls.id, cls.name, cls.prog_id, sessionActiveId, cls.fee],
    });
  }

  // 8. Seed Teacher Class Assignment
  await db.execute({
    sql: `INSERT OR IGNORE INTO teacher_classes (id, teacher_id, class_id, academic_session_id)
          VALUES ('tc_staff1_fsc_pm', 'usr_staff1', 'class_fsc_pm_1a', ?)`,
    args: [sessionActiveId],
  });
  await db.execute({
    sql: `INSERT OR IGNORE INTO teacher_classes (id, teacher_id, class_id, academic_session_id)
          VALUES ('tc_staff1_bscs', 'usr_staff1', 'class_bscs_sem1', ?)`,
    args: [sessionActiveId],
  });

  // 9. Seed Workstation
  await db.execute({
    sql: `INSERT OR IGNORE INTO workstations (id, workstation_name, hardware_id, registered_by, is_active)
          VALUES ('ws_01', 'ZEC-DESKTOP-01', 'HW-ZEC-DESKTOP-01', 'usr_admin', 1)`,
    args: [],
  });

  // 10. Seed Sample Attendance for BSCS Class (if students exist)
  const bscsStudents = await query('SELECT id FROM students WHERE class_id = ?', ['class_bscs_sem1']);
  if (bscsStudents.rows.length > 0) {
    const today = new Date().toISOString().split('T')[0];
    const sessId = `att_sess_bscs_${today}`;
    
    // Check if session exists
    const existingSess = await query('SELECT id FROM attendance_sessions WHERE id = ?', [sessId]);
    if (existingSess.rows.length === 0) {
      const total = bscsStudents.rows.length;
      let pCount = 0;
      let aCount = 0;
      let lCount = 0;

      await db.execute({
        sql: `INSERT OR IGNORE INTO attendance_sessions (
          id, class_id, academic_session_id, attendance_date, status,
          total_enrolled, present_count, absent_count, late_count, excused_count,
          marked_by_user_id, marked_at
        ) VALUES (?, 'class_bscs_sem1', ?, ?, 'submitted', ?, ?, ?, ?, 0, 'usr_staff1', CURRENT_TIMESTAMP)`,
        args: [sessId, sessionActiveId, today, total, total - 1, 1, 0],
      });

      for (let i = 0; i < total; i++) {
        const sId = (bscsStudents.rows[i] as any).id;
        const status = i === 0 ? 'absent' : (i === 1 ? 'late' : 'present');
        if (status === 'present') pCount++;
        else if (status === 'absent') aCount++;
        else if (status === 'late') lCount++;

        await db.execute({
          sql: `INSERT OR IGNORE INTO attendance_records (
            id, attendance_session_id, student_id, class_id, academic_session_id,
            attendance_date, status, remarks, marked_by_user_id, marked_at
          ) VALUES (?, ?, ?, 'class_bscs_sem1', ?, ?, ?, ?, 'usr_staff1', CURRENT_TIMESTAMP)`,
          args: [
            `rec_${sessId}_${sId}`,
            sessId,
            sId,
            sessionActiveId,
            today,
            status,
            status === 'absent' ? 'Sick leave reported' : (status === 'late' ? 'Traffic delay' : null),
          ],
        });
      }

      // Update session counts
      await db.execute({
        sql: `UPDATE attendance_sessions SET present_count = ?, absent_count = ?, late_count = ? WHERE id = ?`,
        args: [pCount, aCount, lCount, sessId],
      });
    }
  }

  console.log('🎉 Database seeding completed successfully.');
}

// Allow direct execution
if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('💥 Seeding failed:', err);
      process.exit(1);
    });
}
