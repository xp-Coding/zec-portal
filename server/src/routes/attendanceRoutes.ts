import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query, queryOne, queryAll, getDb } from '../database/db.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { AppError } from '../middleware/errorHandler.js';
import { logAuditEvent } from '../middleware/audit.js';

export const attendanceRouter = Router();

// Base authentication: Admin and Teacher have access; Fee Manager does not have attendance access
attendanceRouter.use(authenticate, requireRole('admin', 'teacher'));

/**
 * Helper to get current date in Asia/Karachi timezone (YYYY-MM-DD)
 */
function getKarachiDate(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
}

/**
 * Centralized authorization check: Teacher can only access their assigned classes
 */
async function authorizeClassAccess(user: { id: string; role: string }, classId: string): Promise<boolean> {
  if (user.role === 'admin') return true;
  if (user.role === 'teacher') {
    const assignment = await queryOne(
      'SELECT id FROM teacher_classes WHERE teacher_id = ? AND class_id = ?',
      [user.id, classId]
    );
    return !!assignment;
  }
  return false;
}

// 1. GET /api/attendance/dashboard - Attendance KPI Summary & Activity
attendanceRouter.get('/dashboard', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const today = getKarachiDate();

    // Determine authorized classes
    let classFilterSql = '';
    const classFilterParams: any[] = [];

    if (user.role === 'teacher') {
      classFilterSql = ' AND c.id IN (SELECT class_id FROM teacher_classes WHERE teacher_id = ?)';
      classFilterParams.push(user.id);
    }

    // Get active session
    const activeSession = await queryOne('SELECT id, name FROM academic_sessions WHERE is_active = 1 LIMIT 1');
    const sessionId = activeSession?.id;

    // Available classes in scope
    const availableClasses = await queryAll(
      `SELECT c.id, c.name, c.section, p.code as program_code,
              (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id AND s.status = 'active') as student_count
       FROM classes c
       JOIN programs p ON c.program_id = p.id
       WHERE c.status = 'active' ${classFilterSql}
       ORDER BY c.name ASC`,
      classFilterParams
    );

    // Today's attendance summary in authorized scope
    const todayStats = await queryOne(
      `SELECT 
        COALESCE(SUM(total_enrolled), 0) as total_enrolled,
        COALESCE(SUM(present_count), 0) as present_count,
        COALESCE(SUM(absent_count), 0) as absent_count,
        COALESCE(SUM(late_count), 0) as late_count,
        COALESCE(SUM(excused_count), 0) as excused_count,
        COUNT(id) as sessions_marked
       FROM attendance_sessions
       WHERE attendance_date = ? ${user.role === 'teacher' ? 'AND class_id IN (SELECT class_id FROM teacher_classes WHERE teacher_id = ?)' : ''}`,
      user.role === 'teacher' ? [today, user.id] : [today]
    );

    const totalEnrolled = Number(todayStats?.total_enrolled || 0);
    const present = Number(todayStats?.present_count || 0);
    const late = Number(todayStats?.late_count || 0);
    const attendancePct = totalEnrolled > 0 ? Math.round(((present + late) / totalEnrolled) * 100) : 0;

    // Recent activity (last 10 attendance sessions)
    const recentSessions = await queryAll(
      `SELECT 
        s.id, s.attendance_date, s.status, s.total_enrolled,
        s.present_count, s.absent_count, s.late_count, s.excused_count,
        s.marked_at, u.full_name as marked_by_name,
        c.name as class_name, c.section, sess.name as session_name
       FROM attendance_sessions s
       JOIN classes c ON s.class_id = c.id
       JOIN academic_sessions sess ON s.academic_session_id = sess.id
       JOIN users u ON s.marked_by_user_id = u.id
       WHERE 1=1 ${user.role === 'teacher' ? 'AND s.class_id IN (SELECT class_id FROM teacher_classes WHERE teacher_id = ?)' : ''}
       ORDER BY s.attendance_date DESC, s.marked_at DESC
       LIMIT 10`,
      user.role === 'teacher' ? [user.id] : []
    );

    res.json({
      success: true,
      today,
      active_session: activeSession,
      summary: {
        total_enrolled: totalEnrolled,
        present_count: present,
        absent_count: Number(todayStats?.absent_count || 0),
        late_count: late,
        excused_count: Number(todayStats?.excused_count || 0),
        sessions_marked: Number(todayStats?.sessions_marked || 0),
        total_classes: availableClasses.length,
        attendance_percentage: attendancePct,
      },
      available_classes: availableClasses,
      recent_sessions: recentSessions,
    });
  } catch (err) {
    next(err);
  }
});

// 2. GET /api/attendance/roster - Get class roster and existing attendance state for a date
attendanceRouter.get('/roster', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { class_id, academic_session_id, date } = req.query as Record<string, string | undefined>;

    if (!class_id) {
      throw new AppError('Class ID is required', 400, 'ATTENDANCE_CLASS_REQUIRED');
    }

    // Check teacher class authorization
    const isAuthorized = await authorizeClassAccess(req.user!, class_id);
    if (!isAuthorized) {
      throw new AppError('Access denied: You are not assigned to this class', 403, 'TEACHER_CLASS_ACCESS_DENIED');
    }

    const attendanceDate = date || getKarachiDate();

    // Verify class exists
    const classInfo = await queryOne(
      `SELECT c.id, c.name, c.section, c.academic_session_id, p.name as program_name, p.code as program_code, s.name as session_name
       FROM classes c
       JOIN programs p ON c.program_id = p.id
       JOIN academic_sessions s ON c.academic_session_id = s.id
       WHERE c.id = ?`,
      [class_id]
    );

    if (!classInfo) {
      throw new AppError('Class not found', 404, 'ATTENDANCE_CLASS_NOT_FOUND');
    }

    const sessionId = academic_session_id || classInfo.academic_session_id;

    // Fetch enrolled students
    const students = await queryAll(
      `SELECT id, roll_number, full_name, father_name, guardian_phone, status
       FROM students
       WHERE class_id = ? AND academic_session_id = ? AND status = 'active'
       ORDER BY roll_number ASC, full_name ASC`,
      [class_id, sessionId]
    );

    // Fetch existing attendance session and records for this date
    const existingSession = await queryOne(
      `SELECT id, status, total_enrolled, present_count, absent_count, late_count, excused_count,
              marked_by_user_id, marked_at, finalized_by_user_id, finalized_at, notes
       FROM attendance_sessions
       WHERE class_id = ? AND academic_session_id = ? AND attendance_date = ?`,
      [class_id, sessionId, attendanceDate]
    );

    let recordsMap: Record<string, { id: string; status: string; remarks: string | null }> = {};
    if (existingSession) {
      const records = await queryAll(
        `SELECT id, student_id, status, remarks FROM attendance_records WHERE attendance_session_id = ?`,
        [existingSession.id]
      );
      for (const r of records) {
        recordsMap[r.student_id] = { id: r.id, status: r.status, remarks: r.remarks };
      }
    }

    const roster = students.map((s: any) => ({
      ...s,
      attendance: recordsMap[s.id] || null,
    }));

    res.json({
      success: true,
      class_info: classInfo,
      attendance_date: attendanceDate,
      session_info: existingSession || null,
      is_finalized: existingSession?.status === 'finalized',
      roster,
      total_students: students.length,
    });
  } catch (err) {
    next(err);
  }
});

// 3. POST /api/attendance/batch - Save / Mark Batch Attendance
const batchAttendanceSchema = z.object({
  class_id: z.string().min(1, 'Class ID is required'),
  academic_session_id: z.string().min(1, 'Session ID is required'),
  attendance_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Valid YYYY-MM-DD date required'),
  status: z.enum(['draft', 'submitted', 'finalized']).default('submitted'),
  notes: z.string().optional(),
  expected_version: z.number().int().optional(),
  records: z.array(
    z.object({
      student_id: z.string().min(1),
      status: z.enum(['present', 'absent', 'late', 'excused']),
      remarks: z.string().optional().nullable(),
    })
  ).min(1, 'At least one student attendance record is required'),
});

attendanceRouter.post('/batch', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = batchAttendanceSchema.parse(req.body);
    const user = req.user!;
    const db = getDb();

    // Check teacher assignment
    const isAuthorized = await authorizeClassAccess(user, data.class_id);
    if (!isAuthorized) {
      throw new AppError('Access denied: You are not assigned to this class', 403, 'TEACHER_CLASS_ACCESS_DENIED');
    }

    // Check if attendance is already finalized (only Admin can edit finalized sessions)
    const existingSession = await queryOne(
      `SELECT id, status, version FROM attendance_sessions 
       WHERE class_id = ? AND academic_session_id = ? AND attendance_date = ?`,
      [data.class_id, data.academic_session_id, data.attendance_date]
    );

    if (existingSession && existingSession.status === 'finalized' && user.role !== 'admin') {
      throw new AppError(
        'This attendance session is finalized and locked. Contact the Administrator for authorized corrections.',
        403,
        'ATTENDANCE_FINALIZED'
      );
    }

    // Optimistic Concurrency Control: Detect conflict if expected_version provided
    if (existingSession && data.expected_version !== undefined) {
      const currentVersion = Number(existingSession.version || 1);
      if (currentVersion !== data.expected_version) {
        throw new AppError(
          `Concurrency Conflict: This attendance session has been modified by another workstation (current version ${currentVersion}, expected version ${data.expected_version}). Please refresh the roster and review before saving.`,
          409,
          'CONCURRENCY_CONFLICT',
          { current_version: currentVersion, expected_version: data.expected_version }
        );
      }
    }

    // Verify all submitted students belong to this class and session
    const studentIds = data.records.map((r) => r.student_id);
    const placeholders = studentIds.map(() => '?').join(',');
    const validStudents = await queryAll(
      `SELECT id FROM students 
       WHERE id IN (${placeholders}) AND class_id = ? AND academic_session_id = ?`,
      [...studentIds, data.class_id, data.academic_session_id]
    );

    if (validStudents.length !== studentIds.length) {
      throw new AppError(
        'One or more submitted students are not enrolled in the selected class and session',
        400,
        'ATTENDANCE_STUDENT_NOT_ENROLLED'
      );
    }

    // Calculate status counts
    let presentCount = 0;
    let absentCount = 0;
    let lateCount = 0;
    let excusedCount = 0;

    for (const r of data.records) {
      if (r.status === 'present') presentCount++;
      else if (r.status === 'absent') absentCount++;
      else if (r.status === 'late') lateCount++;
      else if (r.status === 'excused') excusedCount++;
    }

    const totalEnrolled = data.records.length;
    const sessionId = existingSession?.id || `att_sess_${data.class_id}_${data.attendance_date}`;

    // Upsert attendance session header with version increment
    await db.execute({
      sql: `INSERT INTO attendance_sessions (
        id, class_id, academic_session_id, attendance_date, status,
        total_enrolled, present_count, absent_count, late_count, excused_count,
        marked_by_user_id, marked_at, notes, version, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(class_id, academic_session_id, attendance_date) DO UPDATE SET
        status = excluded.status,
        total_enrolled = excluded.total_enrolled,
        present_count = excluded.present_count,
        absent_count = excluded.absent_count,
        late_count = excluded.late_count,
        excused_count = excluded.excused_count,
        notes = excluded.notes,
        version = attendance_sessions.version + 1,
        updated_at = CURRENT_TIMESTAMP`,
      args: [
        sessionId,
        data.class_id,
        data.academic_session_id,
        data.attendance_date,
        data.status,
        totalEnrolled,
        presentCount,
        absentCount,
        lateCount,
        excusedCount,
        user.id,
        data.notes || null,
      ],
    });

    // Upsert student detail records
    let savedCount = 0;
    for (const r of data.records) {
      const recId = `rec_${sessionId}_${r.student_id}`;
      await db.execute({
        sql: `INSERT INTO attendance_records (
          id, attendance_session_id, student_id, class_id, academic_session_id,
          attendance_date, status, remarks, marked_by_user_id, marked_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(student_id, attendance_date) DO UPDATE SET
          attendance_session_id = excluded.attendance_session_id,
          class_id = excluded.class_id,
          academic_session_id = excluded.academic_session_id,
          status = excluded.status,
          remarks = excluded.remarks,
          updated_by_user_id = ?,
          updated_at = CURRENT_TIMESTAMP`,
        args: [
          recId,
          sessionId,
          r.student_id,
          data.class_id,
          data.academic_session_id,
          data.attendance_date,
          r.status,
          r.remarks?.trim() || null,
          user.id,
          user.id, // updated_by_user_id
        ],
      });
      savedCount++;
    }

    await logAuditEvent({
      eventType: 'ATTENDANCE_MARKED',
      actorId: user.id,
      actorName: user.username,
      role: user.role,
      workstationId: req.workstationId || 'WS-ATTENDANCE',
      targetTable: 'attendance_sessions',
      targetId: sessionId,
      action: 'BATCH_SAVE',
      details: JSON.stringify({
        class_id: data.class_id,
        date: data.attendance_date,
        total: totalEnrolled,
        present: presentCount,
        absent: absentCount,
        late: lateCount,
        excused: excusedCount,
      }),
    });

    res.json({
      success: true,
      message: `Successfully saved attendance for ${savedCount} students.`,
      session_id: sessionId,
      version: existingSession ? Number(existingSession.version || 1) + 1 : 1,
      summary: {
        total_records: savedCount,
        total_enrolled: totalEnrolled,
        present_count: presentCount,
        absent_count: absentCount,
        late_count: lateCount,
        excused_count: excusedCount,
        attendance_percentage: Math.round(((presentCount + lateCount) / totalEnrolled) * 100),
      },
    });
  } catch (err) {
    next(err);
  }
});

// 4. POST /api/attendance/finalize/:id - Admin locks or finalizes an attendance session
attendanceRouter.post('/finalize/:id', requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.id;
    const { status = 'finalized' } = req.body;
    const db = getDb();

    const sess = await queryOne('SELECT id, attendance_date, class_id FROM attendance_sessions WHERE id = ?', [sessionId]);
    if (!sess) {
      throw new AppError('Attendance session not found', 404, 'ATTENDANCE_SESSION_NOT_FOUND');
    }

    await db.execute({
      sql: `UPDATE attendance_sessions SET 
        status = ?, finalized_by_user_id = ?, finalized_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
      args: [status, req.user!.id, sessionId],
    });

    await logAuditEvent({
      eventType: status === 'finalized' ? 'ATTENDANCE_FINALIZED' : 'ATTENDANCE_REOPENED',
      actorId: req.user!.id,
      actorName: req.user!.username,
      role: req.user!.role,
      workstationId: req.workstationId || 'WS-ADMIN',
      targetTable: 'attendance_sessions',
      targetId: sessionId as string,
      action: status === 'finalized' ? 'FINALIZE' : 'REOPEN',
    });

    res.json({ success: true, message: `Attendance session ${status} successfully`, status });
  } catch (err) {
    next(err);
  }
});

// 5. POST /api/attendance/correct - Administrative correction of a student's attendance record with audit trail
const correctSchema = z.object({
  record_id: z.string().min(1, 'Record ID is required'),
  new_status: z.enum(['present', 'absent', 'late', 'excused']),
  reason: z.string().min(3, 'A clear reason for correction is required'),
});

attendanceRouter.post('/correct', requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { record_id, new_status, reason } = correctSchema.parse(req.body);
    const db = getDb();

    const record = await queryOne(
      `SELECT r.id, r.attendance_session_id, r.student_id, r.attendance_date, r.status, s.full_name as student_name
       FROM attendance_records r
       JOIN students s ON r.student_id = s.id
       WHERE r.id = ?`,
      [record_id]
    );

    if (!record) {
      throw new AppError('Attendance record not found', 404, 'RECORD_NOT_FOUND');
    }

    const oldStatus = record.status;
    if (oldStatus === new_status) {
      return res.json({ success: true, message: 'Status is already set to ' + new_status });
    }

    // 1. Insert audit correction record
    const corrId = `corr_${Date.now()}`;
    await db.execute({
      sql: `INSERT INTO attendance_corrections (
        id, attendance_record_id, student_id, attendance_date, old_status, new_status, reason, corrected_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [corrId, record_id, record.student_id, record.attendance_date, oldStatus, new_status, reason.trim(), req.user!.id],
    });

    // 2. Update record
    await db.execute({
      sql: `UPDATE attendance_records SET 
        status = ?, updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
      args: [new_status, req.user!.id, record_id],
    });

    // 3. Recalculate session totals
    const counts = await queryOne(
      `SELECT 
        SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) as p_count,
        SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as a_count,
        SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) as l_count,
        SUM(CASE WHEN status = 'excused' THEN 1 ELSE 0 END) as e_count
       FROM attendance_records WHERE attendance_session_id = ?`,
      [record.attendance_session_id]
    );

    await db.execute({
      sql: `UPDATE attendance_sessions SET 
        present_count = ?, absent_count = ?, late_count = ?, excused_count = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
      args: [counts.p_count, counts.a_count, counts.l_count, counts.e_count, record.attendance_session_id],
    });

    await logAuditEvent({
      eventType: 'ATTENDANCE_CORRECTED',
      actorId: req.user!.id,
      actorName: req.user!.username,
      role: req.user!.role,
      workstationId: req.workstationId || 'WS-ADMIN',
      targetTable: 'attendance_records',
      targetId: record_id,
      action: 'CORRECT',
      reason: reason.trim(),
      details: JSON.stringify({ old_status: oldStatus, new_status }),
    });

    res.json({
      success: true,
      message: `Updated attendance for ${record.student_name} from ${oldStatus} to ${new_status}.`,
      correction_id: corrId,
    });
  } catch (err) {
    next(err);
  }
});

// 6. GET /api/attendance/reports/daily - Daily Attendance Report for a class
attendanceRouter.get('/reports/daily', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { class_id, date, academic_session_id } = req.query as Record<string, string | undefined>;
    if (!class_id) {
      throw new AppError('Class ID is required', 400, 'CLASS_ID_REQUIRED');
    }

    const isAuthorized = await authorizeClassAccess(req.user!, class_id);
    if (!isAuthorized) {
      throw new AppError('Access denied: You are not assigned to this class', 403, 'TEACHER_CLASS_ACCESS_DENIED');
    }

    const queryDate = date || getKarachiDate();

    const classInfo = await queryOne(
      `SELECT c.id, c.name as class_name, c.section, c.academic_session_id, p.name as program_name, p.code as program_code, s.name as session_name
       FROM classes c
       JOIN programs p ON c.program_id = p.id
       JOIN academic_sessions s ON c.academic_session_id = s.id
       WHERE c.id = ?`,
      [class_id]
    );

    const sessionId = academic_session_id || classInfo?.academic_session_id;

    const sessionData = await queryOne(
      `SELECT * FROM attendance_sessions WHERE class_id = ? AND attendance_date = ?`,
      [class_id, queryDate]
    );

    const records = await queryAll(
      `SELECT 
        s.id as student_id, s.roll_number, s.full_name, s.father_name,
        COALESCE(r.status, 'unmarked') as status, r.remarks, r.marked_at
       FROM students s
       LEFT JOIN attendance_records r ON s.id = r.student_id AND r.attendance_date = ?
       WHERE s.class_id = ? AND (s.academic_session_id = ? OR ? IS NULL) AND s.status = 'active'
       ORDER BY s.roll_number ASC`,
      [queryDate, class_id, sessionId, sessionId]
    );

    const total = records.length;
    const present = records.filter((r: any) => r.status === 'present').length;
    const absent = records.filter((r: any) => r.status === 'absent').length;
    const late = records.filter((r: any) => r.status === 'late').length;
    const excused = records.filter((r: any) => r.status === 'excused').length;
    const unmarked = records.filter((r: any) => r.status === 'unmarked').length;
    const pct = total > 0 ? Math.round(((present + late) / total) * 100) : 0;

    res.json({
      success: true,
      class_info: classInfo,
      date: queryDate,
      session_data: sessionData || null,
      summary: {
        total_students: total,
        present_count: present,
        absent_count: absent,
        late_count: late,
        excused_count: excused,
        unmarked_count: unmarked,
        attendance_percentage: pct,
      },
      records,
    });
  } catch (err) {
    next(err);
  }
});

// 7. GET /api/attendance/reports/low-attendance - Students with attendance below threshold (default 75%)
attendanceRouter.get('/reports/low-attendance', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { class_id, threshold = '75', start_date, end_date } = req.query as Record<string, string | undefined>;
    const user = req.user!;
    const pctThreshold = parseInt(threshold, 10) || 75;

    let classFilter = '';
    const params: any[] = [];

    if (user.role === 'teacher') {
      classFilter = ' AND s.class_id IN (SELECT class_id FROM teacher_classes WHERE teacher_id = ?)';
      params.push(user.id);
    }

    if (class_id && class_id !== 'all') {
      classFilter += ' AND s.class_id = ?';
      params.push(class_id);
    }

    let dateFilter = '';
    if (start_date && end_date) {
      dateFilter = ' AND r.attendance_date BETWEEN ? AND ?';
      params.push(start_date, end_date);
    }

    // Query aggregated student attendance
    const studentsAgg = await queryAll(
      `SELECT 
        s.id as student_id, s.roll_number, s.full_name, s.father_name, s.guardian_phone,
        c.name as class_name, c.section, p.code as program_code,
        COUNT(r.id) as total_recorded_days,
        SUM(CASE WHEN r.status = 'present' THEN 1 ELSE 0 END) as present_days,
        SUM(CASE WHEN r.status = 'absent' THEN 1 ELSE 0 END) as absent_days,
        SUM(CASE WHEN r.status = 'late' THEN 1 ELSE 0 END) as late_days,
        SUM(CASE WHEN r.status = 'excused' THEN 1 ELSE 0 END) as excused_days
       FROM students s
       JOIN classes c ON s.class_id = c.id
       JOIN programs p ON c.program_id = p.id
       LEFT JOIN attendance_records r ON s.id = r.student_id ${dateFilter}
       WHERE s.status = 'active' ${classFilter}
       GROUP BY s.id
       HAVING total_recorded_days > 0`,
      params
    );

    const defaulters = studentsAgg
      .map((st: any) => {
        const total = Number(st.total_recorded_days);
        const present = Number(st.present_days);
        const late = Number(st.late_days);
        const percentage = total > 0 ? Math.round(((present + late) / total) * 100) : 0;
        return {
          ...st,
          total_recorded_days: total,
          present_days: present,
          absent_days: Number(st.absent_days),
          late_days: late,
          excused_days: Number(st.excused_days),
          attendance_percentage: percentage,
        };
      })
      .filter((st) => st.attendance_percentage < pctThreshold)
      .sort((a, b) => a.attendance_percentage - b.attendance_percentage);

    res.json({
      success: true,
      threshold: pctThreshold,
      total_low_attendance_students: defaulters.length,
      students: defaulters,
    });
  } catch (err) {
    next(err);
  }
});

// 8. GET /api/attendance/student/:id - Student attendance history for Student Profile Workspace
attendanceRouter.get('/student/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const studentId = req.params.id;
    const user = req.user!;

    // Fetch student details
    const student = await queryOne(
      `SELECT id, roll_number, full_name, class_id, academic_session_id FROM students WHERE id = ?`,
      [studentId]
    );

    if (!student) {
      throw new AppError('Student not found', 404, 'STUDENT_NOT_FOUND');
    }

    // Teacher class assignment authorization
    if (user.role === 'teacher') {
      const isAssigned = await authorizeClassAccess(user, student.class_id);
      if (!isAssigned) {
        throw new AppError('Access denied: Student is outside your assigned classes', 403, 'STUDENT_OUT_OF_SCOPE');
      }
    }

    // Attendance summary
    const summary = await queryOne(
      `SELECT 
        COUNT(id) as total_days,
        SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) as present_days,
        SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as absent_days,
        SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) as late_days,
        SUM(CASE WHEN status = 'excused' THEN 1 ELSE 0 END) as excused_days
       FROM attendance_records WHERE student_id = ?`,
      [studentId]
    );

    const totalDays = Number(summary?.total_days || 0);
    const presentDays = Number(summary?.present_days || 0);
    const lateDays = Number(summary?.late_days || 0);
    const pct = totalDays > 0 ? Math.round(((presentDays + lateDays) / totalDays) * 100) : 0;

    // Date-wise chronological history
    const history = await queryAll(
      `SELECT 
        r.id, r.attendance_date, r.status, r.remarks, r.marked_at,
        u.full_name as marked_by_name,
        c.reason as correction_reason, c.old_status as pre_correction_status
       FROM attendance_records r
       LEFT JOIN users u ON r.marked_by_user_id = u.id
       LEFT JOIN attendance_corrections c ON r.id = c.attendance_record_id
       WHERE r.student_id = ?
       ORDER BY r.attendance_date DESC
       LIMIT 60`,
      [studentId]
    );

    res.json({
      success: true,
      student_id: studentId,
      summary: {
        total_days: totalDays,
        present_days: presentDays,
        absent_days: Number(summary?.absent_days || 0),
        late_days: lateDays,
        excused_days: Number(summary?.excused_days || 0),
        attendance_percentage: pct,
      },
      history,
    });
  } catch (err) {
    next(err);
  }
});
