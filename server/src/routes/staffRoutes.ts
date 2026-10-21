import crypto from 'crypto';
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query, queryOne, queryAll, getDb } from '../database/db.js';
import { hashPassword, sanitizeUser } from '../utils/security.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { AppError } from '../middleware/errorHandler.js';
import { logAuditEvent } from '../middleware/audit.js';

export const staffRouter = Router();

// All staff endpoints are strictly Admin-only
staffRouter.use(authenticate, requireRole('admin'));

// Helper to check if user is the last active admin
async function isLastActiveAdmin(userId: string): Promise<boolean> {
  const adminCount = await queryOne(
    `SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND is_active = 1`
  );
  if (Number(adminCount?.count || 0) <= 1) {
    const targetUser = await queryOne(`SELECT role, is_active FROM users WHERE id = ?`, [userId]);
    if (targetUser && targetUser.role === 'admin' && targetUser.is_active === 1) {
      return true;
    }
  }
  return false;
}

// 1. GET /api/staff - Search and filter staff members
staffRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      search,
      role,
      employment_status,
      class_id,
      limit = '100',
      offset = '0',
    } = req.query as Record<string, string | undefined>;

    let sql = `
      SELECT 
        u.id, u.username, u.email, u.full_name, u.role, u.is_active,
        u.employee_id, u.designation, u.department, u.phone, u.address,
        u.joining_date, u.employment_status, u.notes, u.has_login,
        u.last_login_at, u.created_at, u.updated_at
      FROM users u
      WHERE 1=1
    `;
    const params: any[] = [];

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      sql += ` AND (
        u.full_name LIKE ? OR 
        u.username LIKE ? OR 
        u.employee_id LIKE ? OR 
        u.phone LIKE ? OR 
        u.email LIKE ? OR
        u.designation LIKE ?
      )`;
      params.push(q, q, q, q, q, q);
    }

    if (role && role !== 'all') {
      sql += ` AND u.role = ?`;
      params.push(role);
    }

    if (employment_status && employment_status !== 'all') {
      sql += ` AND u.employment_status = ?`;
      params.push(employment_status);
    }

    if (class_id && class_id !== 'all') {
      sql += ` AND u.id IN (SELECT teacher_id FROM teacher_classes WHERE class_id = ?)`;
      params.push(class_id);
    }

    sql += ` ORDER BY u.created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit, 10) || 100, parseInt(offset, 10) || 0);

    const staffRows = await queryAll(sql, params);

    // Fetch assigned classes for teachers in the result set
    const teacherIds = staffRows.filter((s: any) => s.role === 'teacher').map((s: any) => s.id);
    let teacherClassesMap: Record<string, Array<{ class_id: string; class_name: string; session_name: string }>> = {};

    if (teacherIds.length > 0) {
      const placeholders = teacherIds.map(() => '?').join(',');
      const tcRows = await queryAll(
        `SELECT tc.teacher_id, tc.class_id, c.name as class_name, s.name as session_name
         FROM teacher_classes tc
         JOIN classes c ON tc.class_id = c.id
         JOIN academic_sessions s ON tc.academic_session_id = s.id
         WHERE tc.teacher_id IN (${placeholders})`,
        teacherIds
      );

      for (const row of tcRows) {
        if (!teacherClassesMap[row.teacher_id]) {
          teacherClassesMap[row.teacher_id] = [];
        }
        teacherClassesMap[row.teacher_id].push({
          class_id: row.class_id,
          class_name: row.class_name,
          session_name: row.session_name,
        });
      }
    }

    const staff = staffRows.map((s: any) => ({
      ...s,
      assigned_classes: teacherClassesMap[s.id] || [],
    }));

    res.json({ success: true, staff, total: staff.length });
  } catch (err) {
    next(err);
  }
});

// 2. GET /api/staff/:id - Get individual staff profile
staffRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await queryOne(
      `SELECT 
        id, username, email, full_name, role, is_active,
        employee_id, designation, department, phone, address,
        joining_date, employment_status, notes, has_login,
        last_login_at, created_at, updated_at
       FROM users WHERE id = ?`,
      [req.params.id]
    );

    if (!user) {
      throw new AppError('Staff member not found', 404, 'STAFF_NOT_FOUND');
    }

    let assignedClasses: any[] = [];
    if (user.role === 'teacher') {
      assignedClasses = await queryAll(
        `SELECT tc.class_id, c.name as class_name, c.section, p.name as program_name, s.name as session_name, tc.created_at
         FROM teacher_classes tc
         JOIN classes c ON tc.class_id = c.id
         JOIN programs p ON c.program_id = p.id
         JOIN academic_sessions s ON tc.academic_session_id = s.id
         WHERE tc.teacher_id = ?`,
        [user.id]
      );
    }

    res.json({
      success: true,
      staff: {
        ...user,
        assigned_classes: assignedClasses,
      },
    });
  } catch (err) {
    next(err);
  }
});

// 3. POST /api/staff - Create new staff employee and login account
const createStaffSchema = z.object({
  full_name: z.string().min(2, 'Full name is required'),
  employee_id: z.string().optional(),
  designation: z.string().min(1, 'Designation is required'),
  department: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Invalid email address'),
  address: z.string().optional(),
  joining_date: z.string().optional(),
  employment_status: z.enum(['active', 'on_leave', 'resigned', 'terminated']).default('active'),
  role: z.enum(['admin', 'fee_manager', 'teacher']).default('teacher'),
  has_login: z.boolean().default(true),
  username: z.string().min(3, 'Username must be at least 3 characters'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  assigned_class_ids: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

staffRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createStaffSchema.parse(req.body);
    const db = getDb();

    // Check username uniqueness
    const existingUser = await queryOne('SELECT id FROM users WHERE username = ?', [data.username]);
    if (existingUser) {
      throw new AppError('Username already in use', 400, 'STAFF_ACCOUNT_ALREADY_EXISTS');
    }

    // Check email uniqueness
    const existingEmail = await queryOne('SELECT id FROM users WHERE email = ?', [data.email]);
    if (existingEmail) {
      throw new AppError('Email address already registered', 400, 'EMAIL_ALREADY_EXISTS');
    }

    // Check employee_id uniqueness if provided
    let empId = data.employee_id?.trim();
    if (empId) {
      const existingEmp = await queryOne('SELECT id FROM users WHERE employee_id = ?', [empId]);
      if (existingEmp) {
        throw new AppError(`Employee ID ${empId} already assigned`, 400, 'EMPLOYEE_ID_EXISTS');
      }
    } else {
      empId = `EMP-${Date.now().toString().slice(-4)}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    }

    const newStaffId = `usr_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const passwordHash = await hashPassword(data.password);
    const joiningDate = data.joining_date || new Date().toISOString().split('T')[0];

    await db.execute({
      sql: `INSERT INTO users (
        id, username, email, full_name, password_hash, role, is_active,
        employee_id, designation, department, phone, address, joining_date,
        employment_status, notes, has_login
      ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        newStaffId,
        data.username.trim().toLowerCase(),
        data.email.trim().toLowerCase(),
        data.full_name.trim(),
        passwordHash,
        data.role,
        empId,
        data.designation.trim(),
        data.department?.trim() || null,
        data.phone?.trim() || null,
        data.address?.trim() || null,
        joiningDate,
        data.employment_status,
        data.notes?.trim() || null,
        data.has_login ? 1 : 0,
      ],
    });

    // If teacher, assign selected classes
    if (data.role === 'teacher' && data.assigned_class_ids && data.assigned_class_ids.length > 0) {
      for (const classId of data.assigned_class_ids) {
        const cls = await queryOne('SELECT academic_session_id FROM classes WHERE id = ?', [classId]);
        if (cls) {
          await db.execute({
            sql: `INSERT OR IGNORE INTO teacher_classes (id, teacher_id, class_id, academic_session_id, assigned_by_user_id)
                  VALUES (?, ?, ?, ?, ?)`,
            args: [`tc_${newStaffId}_${classId}`, newStaffId, classId, cls.academic_session_id, req.user!.id],
          });
        }
      }
    }

    await logAuditEvent({
      eventType: 'STAFF_CREATED',
      actorId: req.user!.id,
      actorName: req.user!.username,
      role: req.user!.role,
      workstationId: req.workstationId || 'WS-ADMIN',
      targetTable: 'users',
      targetId: newStaffId,
      action: 'CREATE',
      details: JSON.stringify({
        username: data.username,
        role: data.role,
        employee_id: empId,
        designation: data.designation,
      }),
    });

    const createdStaff = await queryOne(
      'SELECT id, username, email, full_name, role, employee_id, designation, department, phone, employment_status FROM users WHERE id = ?',
      [newStaffId]
    );

    res.status(201).json({
      success: true,
      message: 'Staff profile created successfully',
      staff: createdStaff,
    });
  } catch (err) {
    next(err);
  }
});

// 4. PUT /api/staff/:id - Edit staff details, role and teacher class assignments
const updateStaffSchema = z.object({
  full_name: z.string().min(2, 'Full name is required').optional(),
  employee_id: z.string().optional(),
  designation: z.string().min(1, 'Designation is required').optional(),
  department: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Invalid email address').optional(),
  address: z.string().optional(),
  joining_date: z.string().optional(),
  employment_status: z.enum(['active', 'on_leave', 'resigned', 'terminated']).optional(),
  role: z.enum(['admin', 'fee_manager', 'teacher']).optional(),
  has_login: z.boolean().optional(),
  assigned_class_ids: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

staffRouter.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateStaffSchema.parse(req.body);
    const staffId = req.params.id as string;
    const db = getDb();

    const existing = await queryOne('SELECT * FROM users WHERE id = ?', [staffId]);
    if (!existing) {
      throw new AppError('Staff member not found', 404, 'STAFF_NOT_FOUND');
    }

    const newRole = data.role !== undefined ? data.role : existing.role;
    const newFullName = data.full_name !== undefined ? data.full_name.trim() : existing.full_name;
    const newEmail = data.email !== undefined ? data.email.trim().toLowerCase() : existing.email;
    const newDesignation = data.designation !== undefined ? data.designation.trim() : existing.designation;
    const newDepartment = data.department !== undefined ? (data.department?.trim() || null) : existing.department;
    const newPhone = data.phone !== undefined ? (data.phone?.trim() || null) : existing.phone;
    const newAddress = data.address !== undefined ? (data.address?.trim() || null) : existing.address;
    const newJoiningDate = data.joining_date !== undefined ? data.joining_date : existing.joining_date;
    const newEmploymentStatus = data.employment_status !== undefined ? data.employment_status : existing.employment_status;
    const newHasLogin = data.has_login !== undefined ? (data.has_login ? 1 : 0) : existing.has_login;
    const newNotes = data.notes !== undefined ? (data.notes?.trim() || null) : existing.notes;
    const newEmployeeId = data.employee_id !== undefined ? (data.employee_id?.trim() || null) : existing.employee_id;

    // Last admin safeguard: Prevent changing role away from admin if last active admin
    if (existing.role === 'admin' && newRole !== 'admin') {
      const isLast = await isLastActiveAdmin(staffId);
      if (isLast) {
        throw new AppError(
          'Cannot change role: The system must retain at least one active Administrator.',
          400,
          'CANNOT_DOWNGRADE_LAST_ADMIN'
        );
      }
    }

    // Check email uniqueness if changed
    if (data.email && newEmail !== existing.email) {
      const emailConflict = await queryOne('SELECT id FROM users WHERE email = ? AND id != ?', [newEmail, staffId]);
      if (emailConflict) {
        throw new AppError('Email address is already in use by another account', 400, 'EMAIL_ALREADY_EXISTS');
      }
    }

    // Check employee_id uniqueness if changed
    if (data.employee_id && newEmployeeId !== existing.employee_id) {
      const empConflict = await queryOne('SELECT id FROM users WHERE employee_id = ? AND id != ?', [newEmployeeId, staffId]);
      if (empConflict) {
        throw new AppError(`Employee ID ${newEmployeeId} is already in use`, 400, 'EMPLOYEE_ID_EXISTS');
      }
    }

    await db.execute({
      sql: `UPDATE users SET 
        full_name = ?, email = ?, employee_id = ?, designation = ?,
        department = ?, phone = ?, address = ?, joining_date = ?,
        employment_status = ?, role = ?, has_login = ?, notes = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
      args: [
        newFullName,
        newEmail,
        newEmployeeId,
        newDesignation,
        newDepartment,
        newPhone,
        newAddress,
        newJoiningDate,
        newEmploymentStatus,
        newRole,
        newHasLogin,
        newNotes,
        staffId,
      ],
    });

    // Update teacher classes if assigned_class_ids provided or role changed
    if (data.assigned_class_ids !== undefined) {
      // Clear existing assignments and set new
      await db.execute({
        sql: 'DELETE FROM teacher_classes WHERE teacher_id = ?',
        args: [staffId],
      });

      if (data.assigned_class_ids.length > 0) {
        for (const classId of data.assigned_class_ids) {
          const cls = await queryOne('SELECT academic_session_id FROM classes WHERE id = ?', [classId]);
          if (cls) {
            await db.execute({
              sql: `INSERT OR IGNORE INTO teacher_classes (id, teacher_id, class_id, academic_session_id, assigned_by_user_id)
                    VALUES (?, ?, ?, ?, ?)`,
              args: [`tc_${staffId}_${classId}`, staffId, classId, cls.academic_session_id, req.user!.id],
            });
          }
        }
      }
    } else if (newRole !== 'teacher' && existing.role === 'teacher') {
      // If role changed from teacher to another role, clear teacher class assignments
      await db.execute({
        sql: 'DELETE FROM teacher_classes WHERE teacher_id = ?',
        args: [staffId],
      });
    }

    await logAuditEvent({
      eventType: 'STAFF_UPDATED',
      actorId: req.user!.id,
      actorName: req.user!.username,
      role: req.user!.role,
      workstationId: req.workstationId || 'WS-ADMIN',
      targetTable: 'users',
      targetId: staffId,
      action: 'UPDATE',
      details: JSON.stringify({
        role: newRole,
        designation: newDesignation,
        employment_status: newEmploymentStatus,
      }),
    });

    const updatedStaff = await queryOne(
      'SELECT id, username, email, full_name, role, employee_id, designation, department, phone, employment_status FROM users WHERE id = ?',
      [staffId]
    );
    const assignedRows = await queryAll('SELECT class_id FROM teacher_classes WHERE teacher_id = ?', [staffId]);
    const assignedClassIds = assignedRows.map((r: any) => r.class_id);

    res.json({
      success: true,
      message: 'Staff profile updated successfully',
      staff: {
        ...updatedStaff,
        assigned_classes: assignedClassIds,
      },
    });
  } catch (err) {
    next(err);
  }
});

// 5. POST /api/staff/:id/reset-password - Admin initiates password reset for staff member
staffRouter.post('/:id/reset-password', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { new_password } = req.body;
    if (!new_password || typeof new_password !== 'string' || new_password.length < 6) {
      throw new AppError('New password must be at least 6 characters long', 400, 'INVALID_PASSWORD');
    }

    const staffId = req.params.id as string;
    const target = await queryOne('SELECT id, username, full_name, role FROM users WHERE id = ?', [staffId]);
    if (!target) {
      throw new AppError('Staff member not found', 404, 'STAFF_NOT_FOUND');
    }

    const hash = await hashPassword(new_password);
    const db = getDb();
    await db.execute({
      sql: 'UPDATE users SET password_hash = ?, token_version = token_version + 1, failed_login_attempts = 0, locked_until = NULL, password_changed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      args: [hash, staffId],
    });

    await logAuditEvent({
      eventType: 'SECURITY_UPDATE',
      actorId: req.user!.id,
      actorName: req.user!.username,
      role: req.user!.role,
      workstationId: req.workstationId || 'WS-ADMIN',
      targetTable: 'users',
      targetId: staffId,
      action: 'ADMIN_PASSWORD_RESET',
      reason: 'Admin initiated credential reset',
    });

    res.json({
      success: true,
      message: `Password reset successfully for ${target.full_name} (${target.username}). Active sessions have been invalidated.`,
    });
  } catch (err) {
    next(err);
  }
});

// 6. POST /api/staff/:id/toggle-status - Deactivate or reactivate staff account
staffRouter.post('/:id/toggle-status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const staffId = req.params.id as string;
    const { is_active, employment_status } = req.body;

    const target = await queryOne('SELECT id, username, full_name, role, is_active FROM users WHERE id = ?', [staffId]);
    if (!target) {
      throw new AppError('Staff member not found', 404, 'STAFF_NOT_FOUND');
    }

    // Last admin safeguard: Prevent deactivating the last active administrator
    if (target.role === 'admin' && target.is_active === 1 && is_active === 0) {
      const isLast = await isLastActiveAdmin(staffId);
      if (isLast) {
        throw new AppError(
          'Cannot deactivate: The system must retain at least one active Administrator.',
          400,
          'CANNOT_DEACTIVATE_LAST_ADMIN'
        );
      }
    }

    const newActiveState = is_active !== undefined ? (is_active ? 1 : 0) : (target.is_active === 1 ? 0 : 1);
    const newStatus = employment_status || (newActiveState === 1 ? 'active' : 'on_leave');

    const db = getDb();
    await db.execute({
      sql: 'UPDATE users SET is_active = ?, employment_status = ?, token_version = token_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      args: [newActiveState, newStatus, staffId],
    });

    await logAuditEvent({
      eventType: newActiveState === 1 ? 'STAFF_REACTIVATED' : 'STAFF_DEACTIVATED',
      actorId: req.user!.id,
      actorName: req.user!.username,
      role: req.user!.role,
      workstationId: req.workstationId || 'WS-ADMIN',
      targetTable: 'users',
      targetId: staffId,
      action: newActiveState === 1 ? 'REACTIVATE' : 'DEACTIVATE',
      details: JSON.stringify({ previous: target.is_active, current: newActiveState }),
    });

    res.json({
      success: true,
      message: `Staff member ${newActiveState === 1 ? 'reactivated' : 'deactivated'} successfully.`,
      is_active: newActiveState,
      employment_status: newStatus,
    });
  } catch (err) {
    next(err);
  }
});

// 7. POST /api/staff/:id/unlock - Admin manually unlocks locked account
staffRouter.post('/:id/unlock', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const staffId = req.params.id as string;
    const target = await queryOne('SELECT id, username, full_name FROM users WHERE id = ?', [staffId]);
    if (!target) {
      throw new AppError('Staff member not found', 404, 'STAFF_NOT_FOUND');
    }

    const db = getDb();
    await db.execute({
      sql: 'UPDATE users SET failed_login_attempts = 0, locked_until = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      args: [staffId],
    });

    await logAuditEvent({
      eventType: 'ACCOUNT_UNLOCKED',
      actorId: req.user!.id,
      actorName: req.user!.username,
      role: req.user!.role,
      workstationId: req.workstationId || 'WS-ADMIN',
      targetTable: 'users',
      targetId: staffId,
      action: 'ADMIN_UNLOCK',
      details: JSON.stringify({ unlocked_user: target.username }),
    });

    res.json({
      success: true,
      message: `Account for ${target.full_name} (${target.username}) has been unlocked successfully.`,
    });
  } catch (err) {
    next(err);
  }
});

// 7. GET /api/staff/teachers/class-assignments - View all teacher class assignments
staffRouter.get('/teachers/class-assignments', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const assignments = await queryAll(`
      SELECT 
        tc.id, tc.teacher_id, tc.class_id, tc.academic_session_id, tc.created_at,
        u.full_name as teacher_name, u.employee_id, u.email as teacher_email,
        c.name as class_name, c.section, p.name as program_name, p.code as program_code,
        s.name as session_name
      FROM teacher_classes tc
      JOIN users u ON tc.teacher_id = u.id
      JOIN classes c ON tc.class_id = c.id
      JOIN programs p ON c.program_id = p.id
      JOIN academic_sessions s ON tc.academic_session_id = s.id
      ORDER BY c.name ASC, u.full_name ASC
    `);

    res.json({ success: true, assignments });
  } catch (err) {
    next(err);
  }
});
