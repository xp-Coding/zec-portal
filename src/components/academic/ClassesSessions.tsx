import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../lib/apiClient';
import { AcademicSession, Program, CollegeClass } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { ClassDetailsWorkspace } from './ClassDetailsWorkspace';

import {
  GraduationCap,
  Calendar,
  Plus,
  Search,
  Filter,
  Users,
  FileSpreadsheet,
  Download,
  Edit2,
  CheckCircle2,
  RefreshCw,
  X,
  AlertCircle,
  ShieldCheck,
  Check,
  Power,
} from 'lucide-react';

interface ClassStudent {
  id: string;
  roll_number: string;
  full_name: string;
  father_name: string;
  guardian_phone: string;
  admission_date: string;
  billing_plan: string;
  status: string;
}

interface ClassFeeStructure {
  id: string;
  fee_head: string;
  fee_head_name: string;
  amount: number;
  billing_frequency: string;
  is_optional: number;
}

export const ClassesSessions: React.FC = () => {
  const { hasRole } = useAuth();
  const isFinancialUser = hasRole('admin', 'fee_manager');

  // Master State
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [classes, setClasses] = useState<CollegeClass[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Selected Academic Session Filter
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');

  // Table Filters & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [programFilter, setProgramFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Selected Class for Side Panel Details
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [classDetailsLoading, setClassDetailsLoading] = useState<boolean>(false);
  const [classDetails, setClassDetails] = useState<{
    class: CollegeClass;
    students: ClassStudent[];
    feeStructures: ClassFeeStructure[];
  } | null>(null);
  const [activeDetailsTab, setActiveDetailsTab] = useState<'roster' | 'fees'>('roster');

  // Modals
  const [showCreateClassModal, setShowCreateClassModal] = useState<boolean>(false);
  const [showEditClassModal, setShowEditClassModal] = useState<boolean>(false);
  const [showCreateSessionModal, setShowCreateSessionModal] = useState<boolean>(false);
  const [showEditSessionModal, setShowEditSessionModal] = useState<boolean>(false);
  const [showGenerateChallansModal, setShowGenerateChallansModal] = useState<boolean>(false);

  // Form States - Create Class
  const [newClassName, setNewClassName] = useState<string>('');
  const [newProgramId, setNewProgramId] = useState<string>('');
  const [newSection, setNewSection] = useState<string>('A');
  const [newMonthlyFee, setNewMonthlyFee] = useState<number>(10000);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Form States - Edit Class
  const [editClassId, setEditClassId] = useState<string>('');
  const [editClassName, setEditClassName] = useState<string>('');
  const [editSection, setEditSection] = useState<string>('A');
  const [editMonthlyFee, setEditMonthlyFee] = useState<number>(10000);
  const [editStatus, setEditStatus] = useState<'active' | 'inactive'>('active');

  // Form States - Create Session
  const [newSessionName, setNewSessionName] = useState<string>('');
  const [newSessionStartDate, setNewSessionStartDate] = useState<string>('2026-08-01');
  const [newSessionEndDate, setNewSessionEndDate] = useState<string>('2027-06-30');
  const [newSessionIsActive, setNewSessionIsActive] = useState<boolean>(false);

  // Form States - Edit Session
  const [editSessionName, setEditSessionName] = useState<string>('');
  const [editSessionStartDate, setEditSessionStartDate] = useState<string>('');
  const [editSessionEndDate, setEditSessionEndDate] = useState<string>('');
  const [editSessionStatus, setEditSessionStatus] = useState<'active' | 'archived' | 'upcoming'>('active');

  // Form States - Generate Challans for Class
  const [challanBillingPeriod, setChallanBillingPeriod] = useState<string>('2026-04');
  const [challanDueDate, setChallanDueDate] = useState<string>('2026-04-10');
  const [includeArrears, setIncludeArrears] = useState<boolean>(true);
  const [challanGenerationResult, setChallanGenerationResult] = useState<any | null>(null);

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (selectedClassId) {
      loadClassDetails(selectedClassId);
    }
  }, [selectedClassId]);

  const loadAll = async () => {
    setIsLoading(true);
    try {
      const [sessRes, progRes, classRes] = await Promise.all([
        apiRequest<{ success: boolean; sessions: AcademicSession[] }>('/college/sessions'),
        apiRequest<{ success: boolean; programs: Program[] }>('/college/programs'),
        apiRequest<{ success: boolean; classes: CollegeClass[] }>('/college/classes'),
      ]);

      if (sessRes.success) {
        setSessions(sessRes.sessions);
        const active = sessRes.sessions.find((s) => s.is_active === 1) || sessRes.sessions[0];
        if (active && !selectedSessionId) {
          setSelectedSessionId(active.id);
        }
      }
      if (progRes.success) {
        setPrograms(progRes.programs);
        if (progRes.programs.length > 0 && !newProgramId) {
          setNewProgramId(progRes.programs[0].id);
        }
      }
      if (classRes.success) {
        setClasses(classRes.classes);
      }
    } catch (err) {
      console.error('Failed to load academic records:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const loadClassDetails = async (classId: string) => {
    setClassDetailsLoading(true);
    try {
      const res = await apiRequest<{
        success: boolean;
        class: CollegeClass;
        students: ClassStudent[];
        feeStructures: ClassFeeStructure[];
      }>(`/college/classes/${classId}`);
      if (res.success) {
        setClassDetails(res);
      }
    } catch (err: any) {
      console.error('Failed to load class details:', err);
    } finally {
      setClassDetailsLoading(false);
    }
  };

  const handleActivateSession = async (id: string) => {
    const sess = sessions.find((s) => s.id === id);
    if (!confirm(`Are you sure you want to set "${sess?.name}" as the globally active academic session?`)) return;

    try {
      await apiRequest(`/college/sessions/${id}/activate`, { method: 'PUT' });
      setSelectedSessionId(id);
      loadAll();
    } catch (err: any) {
      alert(`Could not activate session: ${err.message}`);
    }
  };

  const handleArchiveSession = async (id: string) => {
    const sess = sessions.find((s) => s.id === id);
    if (!confirm(`Archive session "${sess?.name}"? Historical records will be preserved.`)) return;

    try {
      await apiRequest(`/college/sessions/${id}/archive`, { method: 'PUT' });
      loadAll();
    } catch (err: any) {
      alert(`Could not archive session: ${err.message}`);
    }
  };

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    try {
      await apiRequest('/college/sessions', {
        method: 'POST',
        body: JSON.stringify({
          name: newSessionName.trim(),
          start_date: newSessionStartDate,
          end_date: newSessionEndDate,
          is_active: newSessionIsActive,
          status: 'active',
        }),
      });
      setShowCreateSessionModal(false);
      setNewSessionName('');
      loadAll();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create academic session');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenEditSession = () => {
    const sess = sessions.find((s) => s.id === selectedSessionId);
    if (!sess) return;
    setEditSessionName(sess.name);
    setEditSessionStartDate(sess.start_date);
    setEditSessionEndDate(sess.end_date);
    setEditSessionStatus(sess.status);
    setFormError(null);
    setShowEditSessionModal(true);
  };

  const handleEditSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    try {
      await apiRequest(`/college/sessions/${selectedSessionId}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: editSessionName.trim(),
          start_date: editSessionStartDate,
          end_date: editSessionEndDate,
          status: editSessionStatus,
        }),
      });
      setShowEditSessionModal(false);
      loadAll();
    } catch (err: any) {
      setFormError(err.message || 'Failed to update academic session');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    try {
      const res = await apiRequest<{ success: boolean; class: CollegeClass }>('/college/classes', {
        method: 'POST',
        body: JSON.stringify({
          name: newClassName.trim(),
          program_id: newProgramId,
          academic_session_id: selectedSessionId,
          section: newSection.trim().toUpperCase() || 'A',
          default_monthly_fee: newMonthlyFee,
          status: 'active',
        }),
      });

      if (res.success) {
        setShowCreateClassModal(false);
        setNewClassName('');
        loadAll();
        if (res.class) {
          setSelectedClassId(res.class.id);
        }
      }
    } catch (err: any) {
      setFormError(err.message || 'Failed to create class');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenEditClass = (cls: CollegeClass) => {
    setEditClassId(cls.id);
    setEditClassName(cls.name);
    setEditSection(cls.section || 'A');
    setEditMonthlyFee(cls.default_monthly_fee || 0);
    setEditStatus(cls.status);
    setFormError(null);
    setShowEditClassModal(true);
  };

  const handleEditClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    try {
      await apiRequest(`/college/classes/${editClassId}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: editClassName.trim(),
          section: editSection.trim().toUpperCase() || 'A',
          default_monthly_fee: editMonthlyFee,
          status: editStatus,
        }),
      });

      setShowEditClassModal(false);
      loadAll();
      if (selectedClassId === editClassId) {
        loadClassDetails(editClassId);
      }
    } catch (err: any) {
      setFormError(err.message || 'Failed to update class');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleClassStatus = async (cls: CollegeClass) => {
    const newStatus = cls.status === 'active' ? 'inactive' : 'active';
    if (!confirm(`Are you sure you want to set class "${cls.name}" to ${newStatus}?`)) return;

    try {
      await apiRequest(`/college/classes/${cls.id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      });
      loadAll();
      if (selectedClassId === cls.id) {
        loadClassDetails(cls.id);
      }
    } catch (err: any) {
      alert(`Could not change class status: ${err.message}`);
    }
  };

  const handleGenerateClassChallans = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClassId) return;

    setIsSubmitting(true);
    setFormError(null);
    setChallanGenerationResult(null);

    try {
      const res = await apiRequest<{ success: boolean; summary: any; message: string }>('/challans/generate', {
        method: 'POST',
        body: JSON.stringify({
          scope: 'single_class',
          class_id: selectedClassId,
          academic_session_id: selectedSessionId,
          billing_period: challanBillingPeriod.trim(),
          due_date: challanDueDate,
          include_arrears: includeArrears,
        }),
      });

      if (res.success) {
        setChallanGenerationResult(res);
      }
    } catch (err: any) {
      setFormError(err.message || 'Failed to generate challans for this class');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExportRosterCSV = () => {
    if (!classDetails || !classDetails.students.length) {
      alert('No students to export.');
      return;
    }

    const headers = ['Roll Number', 'Full Name', 'Father Name', 'Phone', 'Admission Date', 'Billing Plan', 'Status'];
    const rows = classDetails.students.map((s) => [
      `"${s.roll_number}"`,
      `"${s.full_name}"`,
      `"${s.father_name}"`,
      `"${s.guardian_phone}"`,
      `"${s.admission_date}"`,
      `"${s.billing_plan}"`,
      `"${s.status}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${classDetails.class.name}_Student_Roster.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered Classes
  const currentSession = sessions.find((s) => s.id === selectedSessionId) || sessions[0];

  const filteredClasses = classes.filter((cls) => {
    const matchesSession = !selectedSessionId || cls.academic_session_id === selectedSessionId;
    const matchesProgram = programFilter === 'all' || cls.program_id === programFilter;
    const matchesStatus = statusFilter === 'all' || cls.status === statusFilter;
    const matchesSearch =
      !searchQuery.trim() ||
      cls.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cls.program_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cls.program_name?.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesSession && matchesProgram && matchesStatus && matchesSearch;
  });

  const totalEnrolledStudents = filteredClasses.reduce((acc, c) => acc + (c.student_count || 0), 0);

  if (selectedClassId) {
    return (
      <ClassDetailsWorkspace
        classId={selectedClassId}
        onBack={() => {
          setSelectedClassId(null);
          loadAll();
        }}
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 font-sans">

      {/* Top Header & Context Bar */}
      <div className="p-4 bg-white border-b border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
        <div>
          <div className="flex items-center space-x-2">
            <GraduationCap className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">Classes & Academic Sessions</h2>
            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[11px] font-semibold rounded-md border border-slate-200">
              Desktop Admin Workspace
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage degree programs, class sections, baseline fee structures, and batch challan generation.
          </p>
        </div>

        {/* Academic Session Selector & Actions */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Active Session Dropdown */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <Calendar className="w-4 h-4 text-indigo-600 ml-2 mr-1.5 shrink-0" />
            <select
              value={selectedSessionId}
              onChange={(e) => setSelectedSessionId(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-900 pr-2 py-1 outline-none cursor-pointer"
            >
              {sessions.map((sess) => (
                <option key={sess.id} value={sess.id}>
                  Session: {sess.name} {sess.is_active === 1 ? '★ (Active)' : ''}
                </option>
              ))}
            </select>
          </div>

          {currentSession?.is_active === 1 ? (
            <span className="px-2.5 py-1.5 bg-emerald-50 border border-emerald-300 text-emerald-700 rounded-lg text-xs font-bold flex items-center space-x-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Current Active Session</span>
            </span>
          ) : (
            isFinancialUser && (
              <button
                onClick={() => handleActivateSession(selectedSessionId)}
                className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-300 text-indigo-700 rounded-lg text-xs font-bold transition flex items-center space-x-1"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Set as Active</span>
              </button>
            )
          )}

          {isFinancialUser && (
            <>
              <button
                onClick={handleOpenEditSession}
                title="Edit Academic Session Dates"
                className="p-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold transition"
              >
                <Edit2 className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  setNewSessionName('');
                  setFormError(null);
                  setShowCreateSessionModal(true);
                }}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold transition flex items-center space-x-1 shadow-sm"
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>New Session</span>
              </button>

              <button
                onClick={() => {
                  setNewClassName('');
                  setFormError(null);
                  setShowCreateClassModal(true);
                }}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1 shadow-md shadow-indigo-600/20"
              >
                <Plus className="w-4 h-4" />
                <span>New Class</span>
              </button>
            </>
          )}

          <button
            onClick={() => {
              setIsRefreshing(true);
              loadAll();
            }}
            title="Refresh Table"
            className="p-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-600 rounded-lg transition"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-indigo-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Session Metadata Banner */}
      {currentSession && (
        <div className="bg-indigo-950 text-indigo-100 px-4 py-2 border-b border-indigo-900 flex items-center justify-between text-xs shrink-0">
          <div className="flex items-center space-x-4">
            <span className="font-semibold text-white">
              Academic Period: <strong className="font-mono text-indigo-300">{currentSession.start_date}</strong> to{' '}
              <strong className="font-mono text-indigo-300">{currentSession.end_date}</strong>
            </span>
            <span className="text-indigo-300">|</span>
            <span>
              Total Classes in Session: <strong className="text-white">{filteredClasses.length}</strong>
            </span>
            <span className="text-indigo-300">|</span>
            <span>
              Enrolled Students: <strong className="text-white">{totalEnrolledStudents}</strong>
            </span>
          </div>

          <div className="flex items-center space-x-2 text-[11px]">
            <span className="text-indigo-300">Status:</span>
            <span className="capitalize font-bold px-2 py-0.2 bg-indigo-900 text-indigo-200 rounded border border-indigo-800">
              {currentSession.status}
            </span>
            {isFinancialUser && currentSession.status !== 'archived' && (
              <button
                onClick={() => handleArchiveSession(currentSession.id)}
                className="text-indigo-400 hover:text-white underline ml-2"
              >
                Archive Session
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Workspace Area (Classes Table & Details Panel) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left / Center Table Section */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden p-4">
          {/* Search & Filter Toolbar */}
          <div className="bg-white p-3 rounded-t-xl border border-slate-200 border-b-0 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center space-x-2 flex-1 max-w-md">
              <div className="relative w-full">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search class by name, code or program..."
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex items-center space-x-2 text-xs">
              <div className="flex items-center space-x-1">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-slate-500 font-medium">Program:</span>
                <select
                  value={programFilter}
                  onChange={(e) => setProgramFilter(e.target.value)}
                  className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 font-medium outline-none"
                >
                  <option value="all">All Programs</option>
                  {programs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center space-x-1">
                <span className="text-slate-500 font-medium">Status:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 font-medium outline-none"
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
          </div>

          {/* Table Container */}
          <div className="flex-1 bg-white border border-slate-200 rounded-b-xl shadow-sm overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900 text-white font-semibold uppercase tracking-wider text-[10px] sticky top-0 z-10">
                <tr>
                  <th className="p-3">Class Name & Section</th>
                  <th className="p-3">Program / Code</th>
                  <th className="p-3">Academic Session</th>
                  <th className="p-3 text-center">Enrolled Students</th>
                  <th className="p-3 text-right">Default Monthly Fee</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400">
                      Loading classes and student enrollments...
                    </td>
                  </tr>
                ) : filteredClasses.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400">
                      No classes found matching the selected filters. Click "New Class" to add one.
                    </td>
                  </tr>
                ) : (
                  filteredClasses.map((cls) => {
                    const isSelected = selectedClassId === cls.id;
                    return (
                      <tr
                        key={cls.id}
                        onClick={() => setSelectedClassId(cls.id)}
                        className={`hover:bg-slate-50 cursor-pointer transition ${
                          isSelected ? 'bg-indigo-50/70 border-l-4 border-indigo-600' : ''
                        }`}
                      >
                        <td className="p-3">
                          <div className="font-bold text-slate-900 flex items-center space-x-1.5">
                            <span>{cls.name}</span>
                            <span className="px-1.5 py-0.2 bg-slate-200 text-slate-700 text-[10px] font-mono rounded">
                              Sec {cls.section || 'A'}
                            </span>
                          </div>
                        </td>

                        <td className="p-3">
                          <div className="text-slate-800 font-semibold">{cls.program_name}</div>
                          <div className="text-[10px] text-indigo-600 font-mono font-bold">{cls.program_code}</div>
                        </td>

                        <td className="p-3 text-slate-600 font-mono text-[11px]">{cls.session_name}</td>

                        <td className="p-3 text-center">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold font-mono ${
                              (cls.student_count || 0) > 0
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            <Users className="w-3 h-3 mr-1" />
                            {cls.student_count || 0} Students
                          </span>
                        </td>

                        <td className="p-3 text-right font-mono font-bold text-slate-900">
                          Rs. {Number(cls.default_monthly_fee).toLocaleString()}
                        </td>

                        <td className="p-3 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold capitalize ${
                              cls.status === 'active'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}
                          >
                            {cls.status}
                          </span>
                        </td>

                        <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center space-x-1">
                            <button
                              onClick={() => setSelectedClassId(cls.id)}
                              title="Inspect Class Details"
                              className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded text-[11px] font-semibold transition"
                            >
                              Details
                            </button>

                            {isFinancialUser && (
                              <>
                                <button
                                  onClick={() => handleOpenEditClass(cls)}
                                  title="Edit Class Information"
                                  className="p-1 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 rounded transition"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>

                                <button
                                  onClick={() => {
                                    setSelectedClassId(cls.id);
                                    setShowGenerateChallansModal(true);
                                  }}
                                  title="Generate Challans for this Class"
                                  className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-bold transition flex items-center space-x-1"
                                >
                                  <FileSpreadsheet className="w-3 h-3" />
                                  <span>Challans</span>
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right-Side Class Details Workspace Side Panel */}
        {selectedClassId && (
          <aside className="w-96 bg-white border-l border-slate-200 shadow-xl flex flex-col shrink-0 overflow-hidden">
            {classDetailsLoading ? (
              <div className="p-8 text-center text-slate-400">Loading class details...</div>
            ) : classDetails ? (
              <>
                {/* Side Panel Header */}
                <div className="p-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
                  <div className="overflow-hidden pr-2">
                    <div className="flex items-center space-x-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
                        {classDetails.class.program_code}
                      </span>
                      <span className="text-slate-500">•</span>
                      <span className="text-[10px] text-slate-300">Sec {classDetails.class.section}</span>
                    </div>
                    <h3 className="font-bold text-sm truncate">{classDetails.class.name}</h3>
                  </div>

                  <button
                    onClick={() => setSelectedClassId(null)}
                    className="p-1 text-slate-400 hover:text-white rounded-md transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Quick Info & Stats */}
                <div className="p-3 bg-slate-50 border-b border-slate-200 grid grid-cols-2 gap-2 text-center text-xs shrink-0">
                  <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-sm">
                    <span className="text-[10px] text-slate-500 block uppercase font-semibold">Active Roster</span>
                    <strong className="text-base text-emerald-700 font-mono">
                      {classDetails.class.student_count || classDetails.students.length}
                    </strong>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-sm">
                    <span className="text-[10px] text-slate-500 block uppercase font-semibold">Default Fee</span>
                    <strong className="text-base text-slate-900 font-mono">
                      Rs. {Number(classDetails.class.default_monthly_fee).toLocaleString()}
                    </strong>
                  </div>
                </div>

                {/* Primary Action Buttons */}
                {isFinancialUser && (
                  <div className="p-3 bg-white border-b border-slate-200 flex flex-col gap-2 shrink-0">
                    <button
                      onClick={() => setShowGenerateChallansModal(true)}
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center justify-center space-x-2 shadow-sm"
                    >
                      <FileSpreadsheet className="w-4 h-4" />
                      <span>Generate Challans for this Class</span>
                    </button>

                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        onClick={handleExportRosterCSV}
                        className="py-1.5 px-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-lg text-[11px] font-semibold transition flex items-center justify-center space-x-1"
                      >
                        <Download className="w-3.5 h-3.5 text-slate-500" />
                        <span>Export CSV</span>
                      </button>

                      <button
                        onClick={() => handleOpenEditClass(classDetails.class)}
                        className="py-1.5 px-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-lg text-[11px] font-semibold transition flex items-center justify-center space-x-1"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-slate-500" />
                        <span>Edit</span>
                      </button>

                      <button
                        onClick={() => handleToggleClassStatus(classDetails.class)}
                        className={`py-1.5 px-2 border rounded-lg text-[11px] font-semibold transition flex items-center justify-center space-x-1 ${
                          classDetails.class.status === 'active'
                            ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
                            : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                        }`}
                      >
                        <Power className="w-3.5 h-3.5" />
                        <span>{classDetails.class.status === 'active' ? 'Deactivate' : 'Activate'}</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Navigation Tabs */}
                <div className="flex border-b border-slate-200 bg-slate-50 text-xs shrink-0">
                  <button
                    onClick={() => setActiveDetailsTab('roster')}
                    className={`flex-1 py-2 font-bold text-center border-b-2 transition ${
                      activeDetailsTab === 'roster'
                        ? 'border-indigo-600 text-indigo-700 bg-white'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Enrolled Roster ({classDetails.students.length})
                  </button>
                  <button
                    onClick={() => setActiveDetailsTab('fees')}
                    className={`flex-1 py-2 font-bold text-center border-b-2 transition ${
                      activeDetailsTab === 'fees'
                        ? 'border-indigo-600 text-indigo-700 bg-white'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Fee Structures ({classDetails.feeStructures.length})
                  </button>
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-y-auto p-3">
                  {activeDetailsTab === 'roster' ? (
                    <div className="space-y-1.5">
                      {classDetails.students.length === 0 ? (
                        <p className="text-xs text-slate-400 p-4 text-center">
                          No students currently enrolled in this class.
                        </p>
                      ) : (
                        classDetails.students.map((std) => (
                          <div
                            key={std.id}
                            className="p-2.5 bg-slate-50 hover:bg-indigo-50/50 border border-slate-200 rounded-lg text-xs flex items-center justify-between transition"
                          >
                            <div>
                              <div className="font-mono font-bold text-indigo-700">{std.roll_number}</div>
                              <div className="font-semibold text-slate-900">{std.full_name}</div>
                              <div className="text-[10px] text-slate-500">Father: {std.father_name}</div>
                            </div>
                            <div className="text-right">
                              <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-emerald-100 text-emerald-800">
                                {std.status}
                              </span>
                              <div className="text-[10px] text-slate-400 capitalize mt-1">{std.billing_plan}</div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {classDetails.feeStructures.length === 0 ? (
                        <p className="text-xs text-slate-400 p-4 text-center">
                          No custom fee heads configured. Uses baseline fee: Rs.{' '}
                          {Number(classDetails.class.default_monthly_fee).toLocaleString()}
                        </p>
                      ) : (
                        classDetails.feeStructures.map((fs) => (
                          <div key={fs.id} className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                            <div className="flex justify-between items-center mb-1">
                              <span className="font-bold text-slate-900">{fs.fee_head_name}</span>
                              <span className="font-mono font-bold text-indigo-700">
                                Rs. {Number(fs.amount).toLocaleString()}
                              </span>
                            </div>
                            <div className="flex justify-between text-[10px] text-slate-500">
                              <span className="capitalize">{fs.billing_frequency.replace('_', ' ')}</span>
                              <span>{fs.is_optional ? 'Optional' : 'Compulsory'}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="p-8 text-center text-slate-400">Select a class to view details</div>
            )}
          </aside>
        )}
      </div>

      {/* MODAL: Create New Class */}
      {showCreateClassModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center space-x-2">
                <Plus className="w-4 h-4 text-indigo-400" />
                <span>Create New Class Section</span>
              </h3>
              <button onClick={() => setShowCreateClassModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateClass} className="p-5 space-y-3.5">
              {formError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center space-x-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Degree Program *</label>
                <select
                  value={newProgramId}
                  onChange={(e) => setNewProgramId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 font-medium outline-none"
                >
                  {programs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Class Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 1st Year Pre-Med (Section A)"
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Section</label>
                  <input
                    type="text"
                    required
                    value={newSection}
                    onChange={(e) => setNewSection(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Default Monthly Fee (PKR)</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={newMonthlyFee}
                    onChange={(e) => setNewMonthlyFee(parseInt(e.target.value, 10) || 0)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-bold"
                  />
                </div>
              </div>

              <div className="p-3 bg-indigo-50 rounded-lg text-[11px] text-indigo-700 border border-indigo-200">
                Will be associated with active session: <strong>{currentSession?.name}</strong>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateClassModal(false)}
                  className="px-4 py-2 border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition shadow-md"
                >
                  {isSubmitting ? 'Creating...' : 'Create Class'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Edit Class */}
      {showEditClassModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center space-x-2">
                <Edit2 className="w-4 h-4 text-indigo-400" />
                <span>Edit Class Details</span>
              </h3>
              <button onClick={() => setShowEditClassModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEditClass} className="p-5 space-y-3.5">
              {formError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center space-x-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Class Name *</label>
                <input
                  type="text"
                  required
                  value={editClassName}
                  onChange={(e) => setEditClassName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Section</label>
                  <input
                    type="text"
                    required
                    value={editSection}
                    onChange={(e) => setEditSection(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Monthly Fee (PKR)</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={editMonthlyFee}
                    onChange={(e) => setEditMonthlyFee(parseInt(e.target.value, 10) || 0)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                <select
                  value={editStatus}
                  onChange={(e: any) => setEditStatus(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditClassModal(false)}
                  className="px-4 py-2 border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition shadow-md"
                >
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Create Academic Session */}
      {showCreateSessionModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center space-x-2">
                <Calendar className="w-4 h-4 text-indigo-400" />
                <span>Create Academic Session</span>
              </h3>
              <button onClick={() => setShowCreateSessionModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSession} className="p-5 space-y-3.5">
              {formError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center space-x-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Session Identifier *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 2026-2027"
                  value={newSessionName}
                  onChange={(e) => setNewSessionName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 font-mono font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Start Date *</label>
                  <input
                    type="date"
                    required
                    value={newSessionStartDate}
                    onChange={(e) => setNewSessionStartDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">End Date *</label>
                  <input
                    type="date"
                    required
                    value={newSessionEndDate}
                    onChange={(e) => setNewSessionEndDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="sessActive"
                  checked={newSessionIsActive}
                  onChange={(e) => setNewSessionIsActive(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                <label htmlFor="sessActive" className="text-xs text-slate-700 font-medium">
                  Set as Globally Active Session immediately
                </label>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateSessionModal(false)}
                  className="px-4 py-2 border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition shadow-md"
                >
                  {isSubmitting ? 'Creating...' : 'Create Session'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Edit Academic Session */}
      {showEditSessionModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center space-x-2">
                <Edit2 className="w-4 h-4 text-indigo-400" />
                <span>Edit Academic Session Dates</span>
              </h3>
              <button onClick={() => setShowEditSessionModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEditSession} className="p-5 space-y-3.5">
              {formError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center space-x-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Session Identifier *</label>
                <input
                  type="text"
                  required
                  value={editSessionName}
                  onChange={(e) => setEditSessionName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Start Date *</label>
                  <input
                    type="date"
                    required
                    value={editSessionStartDate}
                    onChange={(e) => setEditSessionStartDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">End Date *</label>
                  <input
                    type="date"
                    required
                    value={editSessionEndDate}
                    onChange={(e) => setEditSessionEndDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                <select
                  value={editSessionStatus}
                  onChange={(e: any) => setEditSessionStatus(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                >
                  <option value="active">Active</option>
                  <option value="upcoming">Upcoming</option>
                  <option value="archived">Archived</option>
                </select>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditSessionModal(false)}
                  className="px-4 py-2 border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition shadow-md"
                >
                  {isSubmitting ? 'Saving...' : 'Save Dates'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: One-Click Challan Generation for Single Class */}
      {showGenerateChallansModal && classDetails && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="p-4 bg-emerald-900 text-white flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center space-x-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                <span>Class Challan Generation Engine</span>
              </h3>
              <button
                onClick={() => {
                  setShowGenerateChallansModal(false);
                  setChallanGenerationResult(null);
                }}
                className="text-emerald-300 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                <span className="text-[10px] text-emerald-700 uppercase font-bold block">Target Class</span>
                <h4 className="text-sm font-bold text-slate-900">{classDetails.class.name}</h4>
                <p className="text-xs text-slate-600">
                  {classDetails.class.program_name} | {classDetails.students.length} Eligible Active Students
                </p>
              </div>

              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {challanGenerationResult ? (
                <div className="space-y-3">
                  <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl text-center">
                    <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-1" />
                    <h5 className="font-bold text-sm text-emerald-900">Challans Generated Successfully!</h5>
                    <p className="text-xs text-emerald-700">{challanGenerationResult.message}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-center">
                      <span className="text-[10px] text-slate-500 block uppercase">New Invoices</span>
                      <strong className="text-base font-bold text-emerald-700 font-mono">
                        {challanGenerationResult.summary?.generated || 0}
                      </strong>
                    </div>
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-center">
                      <span className="text-[10px] text-slate-500 block uppercase">Skipped (Duplicate)</span>
                      <strong className="text-base font-bold text-amber-700 font-mono">
                        {challanGenerationResult.summary?.skipped_duplicate || 0}
                      </strong>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setShowGenerateChallansModal(false);
                      setChallanGenerationResult(null);
                    }}
                    className="w-full py-2 bg-slate-800 text-white rounded-lg text-xs font-bold"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <form onSubmit={handleGenerateClassChallans} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Billing Period *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. 2026-04"
                        value={challanBillingPeriod}
                        onChange={(e) => setChallanBillingPeriod(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-bold"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Due Date *</label>
                      <input
                        type="date"
                        required
                        value={challanDueDate}
                        onChange={(e) => setChallanDueDate(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 pt-1">
                    <input
                      type="checkbox"
                      id="incArrears"
                      checked={includeArrears}
                      onChange={(e) => setIncludeArrears(e.target.checked)}
                      className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                    />
                    <label htmlFor="incArrears" className="text-xs text-slate-700 font-medium">
                      Automatically calculate and carry forward outstanding arrears
                    </label>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg text-[11px] text-slate-500 border border-slate-200">
                    <ShieldCheck className="w-3.5 h-3.5 inline mr-1 text-emerald-600" />
                    Enforces idempotency: Students already billed for period{' '}
                    <strong>{challanBillingPeriod}</strong> will be skipped automatically without duplicate entries.
                  </div>

                  <div className="flex justify-end space-x-2 pt-3">
                    <button
                      type="button"
                      onClick={() => setShowGenerateChallansModal(false)}
                      className="px-4 py-2 border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-md shadow-emerald-600/30"
                    >
                      {isSubmitting ? 'Generating Challans...' : 'Generate Challans Now'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
