import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../lib/apiClient';
import {
  AttendanceSession,
  AttendanceRosterItem,
  AttendanceSummary,
  AttendanceStatus,
  CollegeClass,
  AcademicSession,
  LowAttendanceStudent,
} from '../../types';
import { useAuth } from '../../context/AuthContext';
import {
  CalendarCheck,
  CheckCircle2,
  Search,
  RefreshCw,
  Printer,
  AlertTriangle,
  Lock,
  Unlock,
  Check,
  UserCheck,
  Edit3,
  Calendar,
} from 'lucide-react';

export const AttendanceDashboard: React.FC = () => {
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');

  // Master State
  const [activeTab, setActiveTab] = useState<'marking' | 'daily_report' | 'low_attendance'>('marking');
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [classes, setClasses] = useState<CollegeClass[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [attendanceDate, setAttendanceDate] = useState<string>(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  );

  // Dashboard Stats
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);

  // Marking Workspace State
  const [roster, setRoster] = useState<AttendanceRosterItem[]>([]);
  const [sessionInfo, setSessionInfo] = useState<AttendanceSession | null>(null);
  const [isFinalized, setIsFinalized] = useState<boolean>(false);
  const [isLoadingRoster, setIsLoadingRoster] = useState<boolean>(false);
  const [rosterSearch, setRosterSearch] = useState<string>('');
  const [attendanceDraft, setAttendanceDraft] = useState<Record<string, { status: AttendanceStatus; remarks: string }>>({});
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Daily Report State
  const [reportData, setReportData] = useState<any | null>(null);
  const [isLoadingReport, setIsLoadingReport] = useState<boolean>(false);

  // Low Attendance State
  const [lowAttendanceThreshold, setLowAttendanceThreshold] = useState<number>(75);
  const [lowAttendanceStudents, setLowAttendanceStudents] = useState<LowAttendanceStudent[]>([]);
  const [isLoadingLowAttendance, setIsLoadingLowAttendance] = useState<boolean>(false);

  // Admin Correction Modal
  const [showCorrectionModal, setShowCorrectionModal] = useState<boolean>(false);
  const [correctingRecord, setCorrectingRecord] = useState<{ id: string; studentName: string; currentStatus: AttendanceStatus } | null>(null);
  const [newStatus, setNewStatus] = useState<AttendanceStatus>('present');
  const [correctionReason, setCorrectionReason] = useState<string>('');
  const [isCorrecting, setIsCorrecting] = useState<boolean>(false);

  useEffect(() => {
    loadMetadata();
    loadDashboardStats();
  }, []);

  useEffect(() => {
    if (selectedClassId) {
      loadRoster();
    }
  }, [selectedClassId, selectedSessionId, attendanceDate]);

  const loadMetadata = async () => {
    try {
      const [classRes, sessRes] = await Promise.all([
        apiRequest<{ success: boolean; classes: CollegeClass[] }>('/college/classes'),
        apiRequest<{ success: boolean; sessions: AcademicSession[] }>('/college/sessions'),
      ]);

      if (sessRes.success) {
        setSessions(sessRes.sessions);
        const active = sessRes.sessions.find((s) => s.is_active === 1) || sessRes.sessions[0];
        if (active) setSelectedSessionId(active.id);
      }

      if (classRes.success && classRes.classes.length > 0) {
        setClasses(classRes.classes);
        setSelectedClassId(classRes.classes[0].id);
      }
    } catch (err) {
      console.error('Failed to load attendance metadata:', err);
    }
  };

  const loadDashboardStats = async () => {
    try {
      const res = await apiRequest<{
        success: boolean;
        summary: AttendanceSummary;
        available_classes: CollegeClass[];
        recent_sessions: any[];
      }>('/attendance/dashboard');

      if (res.success) {
        setSummary(res.summary);
      }
    } catch (err) {
      console.error('Failed to load dashboard stats:', err);
    }
  };

  const loadRoster = async () => {
    if (!selectedClassId) return;
    setIsLoadingRoster(true);
    setErrorMessage(null);

    try {
      const res = await apiRequest<{
        success: boolean;
        roster: AttendanceRosterItem[];
        session_info: AttendanceSession | null;
        is_finalized: boolean;
      }>('/attendance/roster', {
        params: {
          class_id: selectedClassId,
          academic_session_id: selectedSessionId,
          date: attendanceDate,
        },
      });

      if (res.success) {
        setRoster(res.roster);
        setSessionInfo(res.session_info);
        setIsFinalized(res.is_finalized);

        // Prepopulate draft state from existing attendance or default to 'present'
        const initialDraft: Record<string, { status: AttendanceStatus; remarks: string }> = {};
        res.roster.forEach((item) => {
          if (item.attendance) {
            initialDraft[item.id] = {
              status: item.attendance.status,
              remarks: item.attendance.remarks || '',
            };
          } else {
            // Unmarked initial state
            initialDraft[item.id] = {
              status: 'present',
              remarks: '',
            };
          }
        });
        setAttendanceDraft(initialDraft);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Could not load class roster');
    } finally {
      setIsLoadingRoster(false);
    }
  };

  const loadDailyReport = async () => {
    if (!selectedClassId) return;
    setIsLoadingReport(true);
    try {
      const res = await apiRequest<{ success: boolean } & any>('/attendance/reports/daily', {
        params: {
          class_id: selectedClassId,
          academic_session_id: selectedSessionId,
          date: attendanceDate,
        },
      });
      if (res.success) {
        setReportData(res);
      }
    } catch (err: any) {
      alert(`Report load failed: ${err.message}`);
    } finally {
      setIsLoadingReport(false);
    }
  };

  const loadLowAttendanceReport = async () => {
    setIsLoadingLowAttendance(true);
    try {
      const res = await apiRequest<{
        success: boolean;
        threshold: number;
        students: LowAttendanceStudent[];
      }>('/attendance/reports/low-attendance', {
        params: {
          class_id: selectedClassId !== 'all' ? selectedClassId : undefined,
          threshold: lowAttendanceThreshold.toString(),
        },
      });
      if (res.success) {
        setLowAttendanceStudents(res.students);
      }
    } catch (err: any) {
      alert(`Low attendance load failed: ${err.message}`);
    } finally {
      setIsLoadingLowAttendance(false);
    }
  };

  // Status marking helpers
  const handleSetStudentStatus = (studentId: string, status: AttendanceStatus) => {
    if (isFinalized && !isAdmin) return;
    setAttendanceDraft((prev) => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || { remarks: '' }),
        status,
      },
    }));
  };

  const handleSetStudentRemarks = (studentId: string, remarks: string) => {
    if (isFinalized && !isAdmin) return;
    setAttendanceDraft((prev) => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || { status: 'present' }),
        remarks,
      },
    }));
  };

  const handleBulkMark = (status: AttendanceStatus) => {
    if (isFinalized && !isAdmin) return;
    const updated: Record<string, { status: AttendanceStatus; remarks: string }> = {};
    roster.forEach((item) => {
      updated[item.id] = {
        status,
        remarks: attendanceDraft[item.id]?.remarks || '',
      };
    });
    setAttendanceDraft(updated);
  };

  // Batch Save Attendance
  const handleSaveAttendance = async () => {
    if (!selectedClassId || !selectedSessionId || roster.length === 0) return;
    setIsSaving(true);
    setErrorMessage(null);

    try {
      const records = roster.map((s) => ({
        student_id: s.id,
        status: attendanceDraft[s.id]?.status || 'present',
        remarks: attendanceDraft[s.id]?.remarks || undefined,
      }));

      const res = await apiRequest<{
        success: boolean;
        message: string;
        summary: any;
      }>('/attendance/batch', {
        method: 'POST',
        body: JSON.stringify({
          class_id: selectedClassId,
          academic_session_id: selectedSessionId,
          attendance_date: attendanceDate,
          status: 'submitted',
          records,
        }),
      });

      if (res.success) {
        setFeedback(res.message);
        setTimeout(() => setFeedback(null), 4000);
        loadRoster();
        loadDashboardStats();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save attendance');
    } finally {
      setIsSaving(false);
    }
  };

  // Lock / Finalize or Reopen Session (Admin Only)
  const handleToggleFinalize = async (targetState: 'finalized' | 'submitted') => {
    if (!sessionInfo) return;
    try {
      await apiRequest(`/attendance/finalize/${sessionInfo.id}`, {
        method: 'POST',
        body: JSON.stringify({ status: targetState }),
      });
      setFeedback(`Attendance session marked as ${targetState}.`);
      setTimeout(() => setFeedback(null), 4000);
      loadRoster();
    } catch (err: any) {
      alert(`Action failed: ${err.message}`);
    }
  };

  // Administrative Correction
  const handleOpenCorrection = (item: AttendanceRosterItem) => {
    if (!item.attendance) {
      alert('This student does not have a saved attendance record for today yet.');
      return;
    }
    setCorrectingRecord({
      id: item.attendance.id,
      studentName: item.full_name,
      currentStatus: item.attendance.status,
    });
    setNewStatus(item.attendance.status === 'present' ? 'late' : 'present');
    setCorrectionReason('');
    setShowCorrectionModal(true);
  };

  const handleSubmitCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctingRecord) return;
    if (!correctionReason.trim()) {
      alert('Please provide a legitimate reason for this administrative correction.');
      return;
    }

    setIsCorrecting(true);
    try {
      const res = await apiRequest<{ success: boolean; message: string }>('/attendance/correct', {
        method: 'POST',
        body: JSON.stringify({
          record_id: correctingRecord.id,
          new_status: newStatus,
          reason: correctionReason.trim(),
        }),
      });

      if (res.success) {
        setShowCorrectionModal(false);
        setFeedback(res.message);
        setTimeout(() => setFeedback(null), 4000);
        loadRoster();
        loadDashboardStats();
      }
    } catch (err: any) {
      alert(`Correction failed: ${err.message}`);
    } finally {
      setIsCorrecting(false);
    }
  };

  // Filter roster by local search input
  const filteredRoster = roster.filter((r) => {
    if (!rosterSearch.trim()) return true;
    const q = rosterSearch.toLowerCase();
    return (
      r.full_name.toLowerCase().includes(q) ||
      r.roll_number.toLowerCase().includes(q) ||
      r.father_name.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 font-sans">
      {/* Top Header */}
      <div className="p-4 bg-white border-b border-slate-200 shadow-sm flex items-center justify-between gap-3 shrink-0">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center space-x-2">
            <CalendarCheck className="w-5 h-5 text-indigo-600" />
            <span>Attendance Management & Classroom Roster</span>
          </h2>
          <p className="text-xs text-slate-500">
            {isAdmin
              ? 'Institution-wide daily attendance monitoring, batch recording and audit-locked corrections.'
              : 'Classroom attendance marking and daily reports for your assigned academic classes.'}
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <div className="px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-xs font-mono text-slate-700 font-semibold flex items-center space-x-1.5">
            <Calendar className="w-3.5 h-3.5 text-indigo-600" />
            <span>PKT: {attendanceDate}</span>
          </div>

          <button
            onClick={() => {
              loadDashboardStats();
              if (selectedClassId) loadRoster();
            }}
            title="Refresh Data"
            className="p-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-600 rounded-lg transition"
          >
            <RefreshCw className="w-4 h-4 text-slate-600" />
          </button>
        </div>
      </div>

      {/* KPI Metrics Ribbon */}
      <div className="p-4 bg-white border-b border-slate-200 shrink-0">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {/* Total Enrolled */}
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Enrolled Scope</span>
            <div className="text-lg font-black text-slate-900 font-mono mt-0.5">
              {summary?.total_enrolled ?? 0}
            </div>
            <span className="text-[10px] text-slate-400">Total in scope</span>
          </div>

          {/* Present */}
          <div className="bg-emerald-50/60 p-3 rounded-xl border border-emerald-200/80">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 block">Present</span>
            <div className="text-lg font-black text-emerald-700 font-mono mt-0.5">
              {summary?.present_count ?? 0}
            </div>
            <span className="text-[10px] text-emerald-600 font-medium">Attending today</span>
          </div>

          {/* Absent */}
          <div className="bg-rose-50/60 p-3 rounded-xl border border-rose-200/80">
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 block">Absent</span>
            <div className="text-lg font-black text-rose-700 font-mono mt-0.5">
              {summary?.absent_count ?? 0}
            </div>
            <span className="text-[10px] text-rose-600 font-medium">Unexcused</span>
          </div>

          {/* Late */}
          <div className="bg-amber-50/60 p-3 rounded-xl border border-amber-200/80">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 block">Late</span>
            <div className="text-lg font-black text-amber-700 font-mono mt-0.5">
              {summary?.late_count ?? 0}
            </div>
            <span className="text-[10px] text-amber-600 font-medium">Tardy arrival</span>
          </div>

          {/* Excused / Leave */}
          <div className="bg-blue-50/60 p-3 rounded-xl border border-blue-200/80">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 block">Excused</span>
            <div className="text-lg font-black text-blue-700 font-mono mt-0.5">
              {summary?.excused_count ?? 0}
            </div>
            <span className="text-[10px] text-blue-600 font-medium">Formal leave</span>
          </div>

          {/* Attendance % */}
          <div className="bg-indigo-50/60 p-3 rounded-xl border border-indigo-200/80">
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 block">Attendance Rate</span>
            <div className="text-lg font-black text-indigo-800 font-mono mt-0.5">
              {summary?.attendance_percentage ?? 0}%
            </div>
            <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mt-1">
              <div
                className="bg-indigo-600 h-full rounded-full transition-all duration-500"
                style={{ width: `${summary?.attendance_percentage ?? 0}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs Header */}
      <div className="bg-white border-b border-slate-200 px-4 flex items-center justify-between shrink-0">
        <div className="flex space-x-6 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('marking')}
            className={`py-3 border-b-2 transition flex items-center space-x-1.5 ${
              activeTab === 'marking'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span>Mark Daily Attendance</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('daily_report');
              loadDailyReport();
            }}
            className={`py-3 border-b-2 transition flex items-center space-x-1.5 ${
              activeTab === 'daily_report'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Printer className="w-4 h-4" />
            <span>Daily Class Report</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('low_attendance');
              loadLowAttendanceReport();
            }}
            className={`py-3 border-b-2 transition flex items-center space-x-1.5 ${
              activeTab === 'low_attendance'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span>Low Attendance Alerts (&lt; 75%)</span>
          </button>
        </div>

        {/* Global Feedback Banner */}
        {feedback && (
          <div className="py-1 px-3 bg-emerald-100 text-emerald-800 text-[11px] font-bold rounded flex items-center space-x-1 animate-fade-in">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>{feedback}</span>
          </div>
        )}
      </div>

      {/* TAB 1: MARK DAILY ATTENDANCE */}
      {activeTab === 'marking' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Controls Bar: Class, Session & Date Selectors */}
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="flex flex-wrap items-center gap-3">
              {/* Class Selector */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                  Class Room
                </label>
                <select
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.section}) — {c.program_code || 'General'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Session Selector */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                  Academic Session
                </label>
                <select
                  value={selectedSessionId}
                  onChange={(e) => setSelectedSessionId(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-700 font-medium"
                >
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.is_active === 1 ? '• Active' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date Selector */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                  Attendance Date
                </label>
                <input
                  type="date"
                  value={attendanceDate}
                  onChange={(e) => setAttendanceDate(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-800"
                />
              </div>

              {/* Session Lock Status Pill */}
              <div className="self-end pb-1">
                {isFinalized ? (
                  <span className="inline-flex items-center space-x-1 px-2.5 py-1 bg-amber-100 text-amber-900 border border-amber-300 rounded-md text-[11px] font-bold">
                    <Lock className="w-3.5 h-3.5 text-amber-700" />
                    <span>Finalized &amp; Locked</span>
                  </span>
                ) : sessionInfo ? (
                  <span className="inline-flex items-center space-x-1 px-2.5 py-1 bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-md text-[11px] font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Saved (Editable)</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center space-x-1 px-2.5 py-1 bg-slate-200 text-slate-700 rounded-md text-[11px] font-medium">
                    <span>Unsaved New Session</span>
                  </span>
                )}
              </div>
            </div>

            {/* Bulk Actions & Save */}
            <div className="flex items-center space-x-2">
              <div className="flex items-center bg-white border border-slate-300 rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => handleBulkMark('present')}
                  disabled={isFinalized && !isAdmin}
                  className="px-2.5 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-50 rounded transition disabled:opacity-50"
                >
                  All Present
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={() => handleBulkMark('absent')}
                  disabled={isFinalized && !isAdmin}
                  className="px-2.5 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-50 rounded transition disabled:opacity-50"
                >
                  All Absent
                </button>
              </div>

              {/* Finalize Lock Action for Admin */}
              {isAdmin && sessionInfo && (
                <button
                  type="button"
                  onClick={() => handleToggleFinalize(isFinalized ? 'submitted' : 'finalized')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1 ${
                    isFinalized
                      ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300'
                      : 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                  }`}
                >
                  {isFinalized ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                  <span>{isFinalized ? 'Unlock Session' : 'Lock Session'}</span>
                </button>
              )}

              {/* Save Attendance Button */}
              <button
                type="button"
                onClick={handleSaveAttendance}
                disabled={isSaving || (isFinalized && !isAdmin) || roster.length === 0}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1.5 shadow-md shadow-indigo-600/20"
              >
                <Check className="w-4 h-4" />
                <span>{isSaving ? 'Saving Roster...' : 'Save Attendance'}</span>
              </button>
            </div>
          </div>

          {/* Roster Search Bar & Error Box */}
          {errorMessage && (
            <div className="m-4 mb-0 p-3 bg-rose-50 border border-rose-300 text-rose-800 rounded-lg text-xs flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="p-3 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
            <div className="relative w-72">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Filter by roll # or student name..."
                value={rosterSearch}
                onChange={(e) => setRosterSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white"
              />
            </div>

            <div className="text-xs text-slate-500 font-medium">
              Showing <strong>{filteredRoster.length}</strong> of {roster.length} enrolled students
            </div>
          </div>

          {/* Enrolled Students Marking Roster */}
          <div className="flex-1 overflow-auto p-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                  <tr>
                    <th className="p-3 w-16">Roll #</th>
                    <th className="p-3">Student Name</th>
                    <th className="p-3">Father / Guardian</th>
                    <th className="p-3 text-center w-64">Attendance Status</th>
                    <th className="p-3">Remarks / Reason</th>
                    {isAdmin && <th className="p-3 text-right">Admin Audit</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoadingRoster ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-600" />
                        <span>Loading class roster...</span>
                      </td>
                    </tr>
                  ) : filteredRoster.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400">
                        No enrolled students found in this class for the selected session.
                      </td>
                    </tr>
                  ) : (
                    filteredRoster.map((item) => {
                      const curStatus = attendanceDraft[item.id]?.status || 'present';
                      const curRemarks = attendanceDraft[item.id]?.remarks || '';

                      return (
                        <tr key={item.id} className="hover:bg-slate-50/70 transition">
                          <td className="p-3 font-mono font-bold text-indigo-700">{item.roll_number}</td>
                          <td className="p-3 font-semibold text-slate-900">{item.full_name}</td>
                          <td className="p-3 text-slate-600">{item.father_name}</td>

                          {/* 4 Status Pill Buttons */}
                          <td className="p-3">
                            <div className="flex items-center justify-center space-x-1">
                              {/* Present */}
                              <button
                                type="button"
                                onClick={() => handleSetStudentStatus(item.id, 'present')}
                                disabled={isFinalized && !isAdmin}
                                className={`px-2.5 py-1 rounded text-xs font-bold transition ${
                                  curStatus === 'present'
                                    ? 'bg-emerald-600 text-white shadow-xs'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                              >
                                P
                              </button>

                              {/* Absent */}
                              <button
                                type="button"
                                onClick={() => handleSetStudentStatus(item.id, 'absent')}
                                disabled={isFinalized && !isAdmin}
                                className={`px-2.5 py-1 rounded text-xs font-bold transition ${
                                  curStatus === 'absent'
                                    ? 'bg-rose-600 text-white shadow-xs'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                              >
                                A
                              </button>

                              {/* Late */}
                              <button
                                type="button"
                                onClick={() => handleSetStudentStatus(item.id, 'late')}
                                disabled={isFinalized && !isAdmin}
                                className={`px-2.5 py-1 rounded text-xs font-bold transition ${
                                  curStatus === 'late'
                                    ? 'bg-amber-600 text-white shadow-xs'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                              >
                                L
                              </button>

                              {/* Excused */}
                              <button
                                type="button"
                                onClick={() => handleSetStudentStatus(item.id, 'excused')}
                                disabled={isFinalized && !isAdmin}
                                className={`px-2.5 py-1 rounded text-xs font-bold transition ${
                                  curStatus === 'excused'
                                    ? 'bg-blue-600 text-white shadow-xs'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                              >
                                E
                              </button>
                            </div>
                          </td>

                          {/* Remarks */}
                          <td className="p-3">
                            <input
                              type="text"
                              placeholder="Optional remarks..."
                              value={curRemarks}
                              disabled={isFinalized && !isAdmin}
                              onChange={(e) => handleSetStudentRemarks(item.id, e.target.value)}
                              className="w-full px-2.5 py-1 bg-slate-50 border border-slate-200 rounded text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          </td>

                          {/* Admin Correction Action */}
                          {isAdmin && (
                            <td className="p-3 text-right">
                              {item.attendance ? (
                                <button
                                  type="button"
                                  onClick={() => handleOpenCorrection(item)}
                                  title="Perform Audited Correction"
                                  className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                              ) : (
                                <span className="text-[10px] text-slate-300">Unsaved</span>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DAILY CLASS ATTENDANCE REPORT */}
      {activeTab === 'daily_report' && (
        <div className="flex-1 flex flex-col overflow-hidden p-4 space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase">Selected Class</span>
                <strong className="block text-slate-900 text-sm">
                  {reportData?.class_info?.class_name || 'Loading...'}
                </strong>
              </div>
              <div className="h-8 w-px bg-slate-200" />
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase">Report Date</span>
                <strong className="block text-indigo-700 text-sm font-mono">{attendanceDate}</strong>
              </div>
            </div>

            <button
              onClick={() => window.print()}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1.5 shadow"
            >
              <Printer className="w-4 h-4" />
              <span>Print Attendance Sheet</span>
            </button>
          </div>

          <div className="flex-1 overflow-auto bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            {isLoadingReport ? (
              <div className="p-8 text-center text-slate-400">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-600" />
                <span>Generating daily class report...</span>
              </div>
            ) : !reportData ? (
              <div className="p-8 text-center text-slate-400">No report data loaded.</div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                  <tr>
                    <th className="p-2.5">Roll #</th>
                    <th className="p-2.5">Student Name</th>
                    <th className="p-2.5">Father Name</th>
                    <th className="p-2.5">Attendance Status</th>
                    <th className="p-2.5">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reportData.records?.map((r: any) => (
                    <tr key={r.student_id}>
                      <td className="p-2.5 font-mono font-bold text-slate-800">{r.roll_number}</td>
                      <td className="p-2.5 font-semibold text-slate-900">{r.full_name}</td>
                      <td className="p-2.5 text-slate-600">{r.father_name}</td>
                      <td className="p-2.5">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            r.status === 'present'
                              ? 'bg-emerald-100 text-emerald-800'
                              : r.status === 'absent'
                              ? 'bg-rose-100 text-rose-800'
                              : r.status === 'late'
                              ? 'bg-amber-100 text-amber-800'
                              : r.status === 'excused'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="p-2.5 text-slate-500">{r.remarks || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: LOW ATTENDANCE ALERTS (< 75%) */}
      {activeTab === 'low_attendance' && (
        <div className="flex-1 flex flex-col overflow-hidden p-4 space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                  Threshold Percentage (%)
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    min="10"
                    max="100"
                    value={lowAttendanceThreshold}
                    onChange={(e) => setLowAttendanceThreshold(parseInt(e.target.value, 10) || 75)}
                    className="w-20 px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-bold"
                  />
                  <button
                    onClick={loadLowAttendanceReport}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold transition"
                  >
                    Apply Filter
                  </button>
                </div>
              </div>
            </div>

            <div className="text-right">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Defaulters Detected</span>
              <strong className="text-rose-600 text-lg font-mono font-black">
                {lowAttendanceStudents.length} Students
              </strong>
            </div>
          </div>

          <div className="flex-1 overflow-auto bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            {isLoadingLowAttendance ? (
              <div className="p-8 text-center text-slate-400">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-600" />
                <span>Checking attendance records against threshold...</span>
              </div>
            ) : lowAttendanceStudents.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                🎉 No students below {lowAttendanceThreshold}% attendance threshold!
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                  <tr>
                    <th className="p-2.5">Roll #</th>
                    <th className="p-2.5">Student Name</th>
                    <th className="p-2.5">Father Name</th>
                    <th className="p-2.5">Guardian Contact</th>
                    <th className="p-2.5">Class</th>
                    <th className="p-2.5 text-center">Days Recorded</th>
                    <th className="p-2.5 text-center">Present / Late</th>
                    <th className="p-2.5 text-center">Absent</th>
                    <th className="p-2.5 text-right">Attendance %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lowAttendanceStudents.map((st) => (
                    <tr key={st.student_id} className="hover:bg-rose-50/40 transition">
                      <td className="p-2.5 font-mono font-bold text-rose-700">{st.roll_number}</td>
                      <td className="p-2.5 font-semibold text-slate-900">{st.full_name}</td>
                      <td className="p-2.5 text-slate-600">{st.father_name}</td>
                      <td className="p-2.5 font-mono text-slate-700">{st.guardian_phone}</td>
                      <td className="p-2.5 font-medium text-slate-800">{st.class_name}</td>
                      <td className="p-2.5 text-center font-mono">{st.total_recorded_days}</td>
                      <td className="p-2.5 text-center font-mono text-emerald-700 font-bold">
                        {st.present_days + st.late_days}
                      </td>
                      <td className="p-2.5 text-center font-mono text-rose-700 font-bold">{st.absent_days}</td>
                      <td className="p-2.5 text-right font-mono font-black text-rose-600 text-sm">
                        {st.attendance_percentage}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ADMIN CORRECTION MODAL */}
      {showCorrectionModal && correctingRecord && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-fade-in p-5 space-y-4 text-xs">
            <div className="flex items-center space-x-3 text-indigo-600">
              <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                <Edit3 className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900">Administrative Attendance Correction</h3>
                <p className="text-slate-500 text-[11px] mt-0.5">
                  Student: <strong>{correctingRecord.studentName}</strong>
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmitCorrection} className="space-y-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">New Attendance Status *</label>
                <select
                  value={newStatus}
                  onChange={(e: any) => setNewStatus(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-bold"
                >
                  <option value="present">Present (On Time)</option>
                  <option value="late">Late (Tardy Arrival)</option>
                  <option value="excused">Excused (Approved Leave)</option>
                  <option value="absent">Absent (Unexcused)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Documented Reason for Correction *
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Approved medical leave slip presented by guardian on Oct 20."
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white"
                />
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-[11px]">
                <strong>Audit Notice:</strong> This change will be permanently logged in the college audit trail
                with your administrator identity and timestamp.
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowCorrectionModal(false)}
                  className="px-4 py-2 border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 rounded-lg font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCorrecting}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold transition shadow-md shadow-indigo-600/20"
                >
                  {isCorrecting ? 'Saving Correction...' : 'Commit Correction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
