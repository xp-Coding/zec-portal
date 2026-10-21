import React, { useState, useEffect, useRef } from 'react';
import { apiRequest } from '../../lib/apiClient';
import { Student, AcademicSession, Program, CollegeClass, CollegeSettings } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { generateChallanPDF, generateReceiptPDF } from '../../lib/pdfGenerator';
import {
  Users,
  UserPlus,
  Search,
  BookOpen,
  AlertTriangle,
  Phone,
  FileSpreadsheet,
  Receipt,
  Printer,
  Edit2,
  X,
  Calendar,
  CheckCircle2,
  ShieldCheck,
  RefreshCw,
  Eye,
  DollarSign,
  Briefcase,
  History,
  FileText,
  BadgePercent,
  AlertCircle,
  Plus,
  CalendarCheck,
} from 'lucide-react';

interface StudentProfileData {
  student: Student;
  academic: {
    program_name: string;
    program_code: string;
    duration_years: number;
    class_name: string;
    class_section: string;
    session_name: string;
    session_start_date: string;
    session_end_date: string;
  };
  fee_overview?: {
    total_agreed_package_fee: number;
    total_qualifying_package_payments: number;
    remaining_package_balance: number;
    current_billing_plan: string;
    current_cycle_amount: number;
    current_invoice_amount_due: number;
    total_outstanding_invoice_balance: number;
    total_arrears: number;
    next_eligible_due_date: string | null;
    scholarship_summary: string;
  };
  challans?: any[];
  payments?: any[];
  ledger?: Array<{
    date: string;
    type: string;
    reference: string;
    description: string;
    debit: number;
    credit: number;
    running_balance: number;
  }>;
  audit_activity?: any[];
}

export const StudentDirectory: React.FC = () => {
  const { hasRole } = useAuth();
  const isFinancialUser = hasRole('admin', 'fee_manager');
  const isAdmin = hasRole('admin');

  // Master State
  const [students, setStudents] = useState<Student[]>([]);
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [classes, setClasses] = useState<CollegeClass[]>([]);
  const [collegeSettings, setCollegeSettings] = useState<CollegeSettings | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Search & Filters
  const [search, setSearch] = useState<string>('');
  const [sessionFilter, setSessionFilter] = useState<string>('');
  const [programFilter, setProgramFilter] = useState<string>('all');
  const [classFilter, setClassFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [billingPlanFilter, setBillingPlanFilter] = useState<string>('all');

  // Search Bar Ref for AutoFocus
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Comprehensive Student Profile Workspace State
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState<boolean>(false);
  const [profileData, setProfileData] = useState<StudentProfileData | null>(null);
  const [profileActiveTab, setProfileActiveTab] = useState<'overview' | 'identity' | 'attendance' | 'challans' | 'payments' | 'ledger' | 'audit'>('overview');
  const [studentAttendance, setStudentAttendance] = useState<{
    summary: {
      total_sessions: number;
      present: number;
      absent: number;
      late: number;
      excused: number;
      attendance_percentage: number;
    };
    history: Array<{
      attendance_date: string;
      status: 'present' | 'absent' | 'late' | 'excused';
      arrival_time: string | null;
      notes: string | null;
      marked_by_name: string;
      is_finalized: number;
      correction_reason: string | null;
    }>;
  } | null>(null);

  // Modals
  const [showAdmitModal, setShowAdmitModal] = useState<boolean>(false);
  const [showEditStudentModal, setShowEditStudentModal] = useState<boolean>(false);
  const [showGenerateNextChallanModal, setShowGenerateNextChallanModal] = useState<boolean>(false);

  // Admission Form State
  const [rollNumber, setRollNumber] = useState<string>('');
  const [fullName, setFullName] = useState<string>('');
  const [fatherName, setFatherName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [selectedProgramId, setSelectedProgramId] = useState<string>('');
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [billingPlan, setBillingPlan] = useState<'monthly' | 'installment'>('monthly');
  const [totalPackageFee, setTotalPackageFee] = useState<number>(120000);
  const [monthlyTuitionFee, setMonthlyTuitionFee] = useState<number>(10000);
  const [scholarshipType, setScholarshipType] = useState<'none' | 'percentage' | 'fixed'>('none');
  const [scholarshipValue, setScholarshipValue] = useState<number>(0);
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Edit Student Form State
  const [editFullName, setEditFullName] = useState<string>('');
  const [editFatherName, setEditFatherName] = useState<string>('');
  const [editPhone, setEditPhone] = useState<string>('');
  const [editAddress, setEditAddress] = useState<string>('');
  const [editClassId, setEditClassId] = useState<string>('');
  const [editStatus, setEditStatus] = useState<any>('active');
  const [editNotes, setEditNotes] = useState<string>('');

  // Single-Student Next Challan Generation State
  const [nextChallanPeriod, setNextChallanPeriod] = useState<string>('2026-04');
  const [nextChallanDueDate, setNextChallanDueDate] = useState<string>('2026-04-10');
  const [nextChallanIncludeArrears, setNextChallanIncludeArrears] = useState<boolean>(true);
  const [challanGenResult, setChallanGenResult] = useState<any | null>(null);

  // Debounced Search
  useEffect(() => {
    const handler = setTimeout(() => {
      loadStudents();
    }, 300);
    return () => clearTimeout(handler);
  }, [search, sessionFilter, programFilter, classFilter, statusFilter, billingPlanFilter]);

  // Initial Load & Focus
  useEffect(() => {
    loadMetadata();
    searchInputRef.current?.focus();
  }, []);

  // Load Profile when a student is selected
  useEffect(() => {
    if (selectedStudentId) {
      loadStudentProfile(selectedStudentId);
    }
  }, [selectedStudentId]);

  const loadMetadata = async () => {
    try {
      const [sessRes, progRes, classRes, setRes] = await Promise.all([
        apiRequest<{ success: boolean; sessions: AcademicSession[] }>('/college/sessions'),
        apiRequest<{ success: boolean; programs: Program[] }>('/college/programs'),
        apiRequest<{ success: boolean; classes: CollegeClass[] }>('/college/classes'),
        apiRequest<{ success: boolean; settings: CollegeSettings }>('/college/settings'),
      ]);

      if (sessRes.success) {
        setSessions(sessRes.sessions);
        const active = sessRes.sessions.find((s) => s.is_active === 1) || sessRes.sessions[0];
        if (active) setSelectedSessionId(active.id);
      }
      if (progRes.success) {
        setPrograms(progRes.programs);
        if (progRes.programs.length > 0) setSelectedProgramId(progRes.programs[0].id);
      }
      if (classRes.success) {
        setClasses(classRes.classes);
        if (classRes.classes.length > 0) {
          setSelectedClassId(classRes.classes[0].id);
          setMonthlyTuitionFee(classRes.classes[0].default_monthly_fee || 10000);
        }
      }
      if (setRes.success) {
        setCollegeSettings(setRes.settings);
      }
    } catch (err) {
      console.error('Failed to load metadata:', err);
    }
  };

  const loadStudents = async () => {
    setIsLoading(true);
    try {
      const params: any = { limit: 100 };
      if (search.trim()) params.search = search.trim();
      if (sessionFilter) params.session_id = sessionFilter;
      if (programFilter !== 'all') params.program_id = programFilter;
      if (classFilter !== 'all') params.class_id = classFilter;
      if (statusFilter !== 'all') params.status = statusFilter;
      if (isFinancialUser && billingPlanFilter !== 'all') params.billing_plan = billingPlanFilter;

      const res = await apiRequest<{ success: boolean; students: Student[] }>('/students', { params });
      if (res.success) {
        setStudents(res.students);
      }
    } catch (err) {
      console.error('Failed to load students:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const loadStudentProfile = async (studentId: string) => {
    setProfileData(null);
    setStudentAttendance(null);
    setProfileActiveTab('overview');
    setProfileLoading(true);
    try {
      const [res, attRes] = await Promise.all([
        apiRequest<{ success: boolean } & StudentProfileData>(`/students/${studentId}/profile`),
        apiRequest<{ success: boolean; summary: any; history: any[] }>(`/attendance/student/${studentId}`).catch(() => ({ success: false, summary: null, history: [] }))
      ]);
      if (res.success) {
        setProfileData(res);
      }
      if (attRes.success) {
        setStudentAttendance({
          summary: attRes.summary,
          history: attRes.history
        });
      } else {
        setStudentAttendance(null);
      }
    } catch (err: any) {
      alert(`Could not load student profile: ${err.message}`);
      setSelectedStudentId(null);
    } finally {
      setProfileLoading(false);
    }
  };

  const handleOpenEditStudent = () => {
    if (!profileData) return;
    const s = profileData.student;
    setEditFullName(s.full_name);
    setEditFatherName(s.father_name);
    setEditPhone(s.guardian_phone);
    setEditAddress(s.address || '');
    setEditClassId(s.class_id);
    setEditStatus(s.status);
    setEditNotes(s.notes || '');
    setFormError(null);
    setShowEditStudentModal(true);
  };

  const handleEditStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileData) return;

    setIsSubmitting(true);
    setFormError(null);

    try {
      await apiRequest(`/students/${profileData.student.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          full_name: editFullName.trim(),
          father_name: editFatherName.trim(),
          guardian_phone: editPhone.trim(),
          address: editAddress.trim(),
          class_id: editClassId,
          status: editStatus,
          notes: editNotes.trim(),
        }),
      });

      setShowEditStudentModal(false);
      loadStudentProfile(profileData.student.id);
      loadStudents();
    } catch (err: any) {
      setFormError(err.message || 'Failed to update student profile');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGenerateNextChallan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileData) return;

    setIsSubmitting(true);
    setFormError(null);
    setChallanGenResult(null);

    try {
      const res = await apiRequest<{ success: boolean; summary: any; message: string; challans: any[] }>(
        '/challans/generate',
        {
          method: 'POST',
          body: JSON.stringify({
            scope: 'single_student',
            student_id: profileData.student.id,
            academic_session_id: profileData.student.academic_session_id,
            billing_period: nextChallanPeriod.trim(),
            due_date: nextChallanDueDate,
            include_arrears: nextChallanIncludeArrears,
          }),
        }
      );

      if (res.success) {
        setChallanGenResult(res);
        loadStudentProfile(profileData.student.id);
      }
    } catch (err: any) {
      setFormError(err.message || 'Failed to generate challan');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrintChallan = (invoice: any) => {
    if (!collegeSettings || !profileData) {
      alert('College settings not loaded for printing.');
      return;
    }
    const doc = generateChallanPDF({
      invoice: {
        ...invoice,
        student_roll: profileData.student.roll_number,
        student_name: profileData.student.full_name,
        father_name: profileData.student.father_name,
        class_name: profileData.academic.class_name,
        program_code: profileData.academic.program_code,
      },
      college: collegeSettings,
    });
    doc.autoPrint();
    const blobUrl = doc.output('bloburl');
    window.open(blobUrl.toString(), '_blank');
  };

  const handlePrintReceipt = (payment: any) => {
    if (!collegeSettings || !profileData) {
      alert('College settings not loaded for receipt printing.');
      return;
    }
    const doc = generateReceiptPDF({
      receipt_no: payment.receipt_no,
      challan_no: payment.challan_no,
      student_name: profileData.student.full_name,
      roll_number: profileData.student.roll_number,
      father_name: profileData.student.father_name,
      class_name: profileData.academic.class_name,
      amount: Number(payment.amount),
      payment_method: payment.payment_method,
      reference_no: payment.reference_no,
      payment_date: payment.payment_date,
      cashier_name: payment.cashier_name || payment.cashier_username,
      workstation_id: payment.workstation_id,
      remaining_invoice_balance: 0,
      total_package_fee: profileData.fee_overview?.total_agreed_package_fee || 0,
      remaining_package_balance: profileData.fee_overview?.remaining_package_balance || 0,
      college: collegeSettings,
    });
    doc.autoPrint();
    const blobUrl = doc.output('bloburl');
    window.open(blobUrl.toString(), '_blank');
  };

  // Admission Submit
  const handleAdmitStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormError(null);

    try {
      const res = await apiRequest<{ success: boolean; student: Student }>('/students/admit', {
        method: 'POST',
        body: JSON.stringify({
          roll_number: rollNumber.trim(),
          full_name: fullName.trim(),
          father_name: fatherName.trim(),
          guardian_phone: phone.trim(),
          address: address.trim(),
          program_id: selectedProgramId,
          class_id: selectedClassId,
          academic_session_id: selectedSessionId,
          billing_plan: billingPlan,
          total_package_fee: totalPackageFee,
          standard_monthly_fee: monthlyTuitionFee,
          scholarship_type: scholarshipType,
          scholarship_value: scholarshipValue,
          notes: notes.trim(),
        }),
      });

      if (res.success) {
        setShowAdmitModal(false);
        setRollNumber('');
        setFullName('');
        setFatherName('');
        setPhone('');
        setAddress('');
        setNotes('');
        loadStudents();
        if (res.student) {
          setSelectedStudentId(res.student.id);
        }
      }
    } catch (err: any) {
      setFormError(err.message || 'Failed to admit student');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 font-sans">
      {/* Top Header */}
      <div className="p-4 bg-white border-b border-slate-200 shadow-sm flex items-center justify-between gap-3 shrink-0">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center space-x-2">
            <Users className="w-5 h-5 text-indigo-600" />
            <span>Student Search & Comprehensive Workspace</span>
          </h2>
          <p className="text-xs text-slate-500">
            {hasRole('teacher')
              ? 'Academic student roster & enrollment details for assigned classes.'
              : 'Search once to view academic placement, financial balance, challan ledger and payment history.'}
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {isFinancialUser && (
            <button
              onClick={() => {
                setRollNumber(`ROLL-${Date.now().toString().slice(-5)}`);
                setFormError(null);
                setShowAdmitModal(true);
              }}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1.5 shadow-md shadow-indigo-600/20"
            >
              <UserPlus className="w-4 h-4" />
              <span>New Admission</span>
            </button>
          )}

          <button
            onClick={() => {
              setIsRefreshing(true);
              loadStudents();
            }}
            title="Refresh Directory"
            className="p-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-600 rounded-lg transition"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-indigo-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Prominent Search Bar & Filter Controls */}
      <div className="p-4 bg-slate-100 border-b border-slate-200 space-y-3 shrink-0">
        {/* Prominent Search Input */}
        <div className="relative w-full">
          <Search className="w-5 h-5 text-indigo-600 absolute left-3.5 top-3" />
          <input
            ref={searchInputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by Roll Number, Student Name, Father's Name, Phone, Class or Program..."
            className="w-full pl-11 pr-10 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm font-medium"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filter Dropdowns */}
        <div className="flex items-center flex-wrap gap-2 text-xs">
          <div className="flex items-center space-x-1 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 shadow-sm">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-500 font-medium">Session:</span>
            <select
              value={sessionFilter}
              onChange={(e) => setSessionFilter(e.target.value)}
              className="bg-transparent text-slate-900 font-semibold outline-none cursor-pointer"
            >
              <option value="">All Sessions</option>
              {sessions.map((sess) => (
                <option key={sess.id} value={sess.id}>
                  {sess.name} {sess.is_active === 1 ? '★' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center space-x-1 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 shadow-sm">
            <BookOpen className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-500 font-medium">Program:</span>
            <select
              value={programFilter}
              onChange={(e) => setProgramFilter(e.target.value)}
              className="bg-transparent text-slate-900 font-semibold outline-none cursor-pointer"
            >
              <option value="all">All Programs</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} - {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center space-x-1 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 shadow-sm">
            <span className="text-slate-500 font-medium">Class:</span>
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="bg-transparent text-slate-900 font-semibold outline-none cursor-pointer"
            >
              <option value="all">All Classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center space-x-1 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 shadow-sm">
            <span className="text-slate-500 font-medium">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent text-slate-900 font-semibold outline-none cursor-pointer"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="graduated">Graduated</option>
              <option value="suspended">Suspended</option>
              <option value="withdrawn">Withdrawn</option>
            </select>
          </div>

          {isFinancialUser && (
            <div className="flex items-center space-x-1 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 shadow-sm">
              <DollarSign className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-500 font-medium">Billing:</span>
              <select
                value={billingPlanFilter}
                onChange={(e) => setBillingPlanFilter(e.target.value)}
                className="bg-transparent text-slate-900 font-semibold outline-none cursor-pointer"
              >
                <option value="all">All Plans</option>
                <option value="monthly">Monthly</option>
                <option value="installment">Installment</option>
              </select>
            </div>
          )}

          <div className="ml-auto text-xs text-slate-500">
            Total Matching: <strong className="text-slate-900 font-mono">{students.length}</strong>
          </div>
        </div>
      </div>

      {/* Search Results List Table */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900 text-white font-semibold uppercase tracking-wider text-[10px] sticky top-0 z-10">
              <tr>
                <th className="p-3">Roll #</th>
                <th className="p-3">Student Name & Father</th>
                <th className="p-3">Class & Program</th>
                <th className="p-3">Guardian Contact</th>
                {isFinancialUser && (
                  <>
                    <th className="p-3 text-right">Agreed Package</th>
                    <th className="p-3 text-right">Package Balance</th>
                    <th className="p-3 text-right">Outstanding Arrears</th>
                  </>
                )}
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {isLoading ? (
                <tr>
                  <td colSpan={isFinancialUser ? 9 : 6} className="p-8 text-center text-slate-400">
                    Loading matching student records...
                  </td>
                </tr>
              ) : students.length === 0 ? (
                <tr>
                  <td colSpan={isFinancialUser ? 9 : 6} className="p-8 text-center text-slate-400">
                    No matching students found. Try searching with a different term or clear filters.
                  </td>
                </tr>
              ) : (
                students.map((std) => (
                  <tr
                    key={std.id}
                    onClick={() => setSelectedStudentId(std.id)}
                    className="hover:bg-slate-50 cursor-pointer transition"
                  >
                    <td className="p-3 font-mono font-bold text-indigo-700">{std.roll_number}</td>

                    <td className="p-3">
                      <div className="font-bold text-slate-900">{std.full_name}</div>
                      <div className="text-[11px] text-slate-500">Father: {std.father_name}</div>
                    </td>

                    <td className="p-3 text-slate-600">
                      <div>{std.class_name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{std.program_code}</div>
                    </td>

                    <td className="p-3 font-mono text-slate-600 text-[11px]">
                      <div className="flex items-center space-x-1">
                        <Phone className="w-3 h-3 text-slate-400" />
                        <span>{std.guardian_phone}</span>
                      </div>
                    </td>

                    {isFinancialUser && (
                      <>
                        <td className="p-3 text-right font-mono font-bold text-slate-900">
                          Rs. {Number(std.total_package_fee || 0).toLocaleString()}
                        </td>

                        <td className="p-3 text-right font-mono font-bold text-amber-600">
                          Rs. {Number(std.remaining_package_balance || 0).toLocaleString()}
                        </td>

                        <td className="p-3 text-right font-mono font-bold text-rose-600">
                          Rs. {Number(std.total_arrears_due || 0).toLocaleString()}
                        </td>
                      </>
                    )}

                    <td className="p-3 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold capitalize ${
                          std.status === 'active'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {std.status}
                      </span>
                    </td>

                    <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setSelectedStudentId(std.id)}
                        className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold rounded-md text-[11px] transition inline-flex items-center space-x-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Open Workspace</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* COMPREHENSIVE STUDENT PROFILE WORKSPACE MODAL */}
      {selectedStudentId && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 select-none overflow-hidden">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-6xl w-full h-[90vh] flex flex-col overflow-hidden">
            {profileLoading ? (
              <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
                Loading complete student profile workspace...
              </div>
            ) : profileData ? (
              <>
                {/* Workspace Header */}
                <div className="p-4 bg-slate-950 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold text-lg font-mono shadow-md">
                      {profileData.student.full_name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <h3 className="font-bold text-base text-white tracking-tight">
                          {profileData.student.full_name}
                        </h3>
                        <span className="font-mono text-xs px-2 py-0.5 bg-indigo-900/80 text-indigo-300 rounded border border-indigo-700">
                          {profileData.student.roll_number}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          {profileData.student.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {profileData.academic.program_name} ({profileData.academic.program_code}) |{' '}
                        {profileData.academic.class_name} | Session: {profileData.academic.session_name}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    {isFinancialUser && (
                      <button
                        onClick={() => {
                          setChallanGenResult(null);
                          setFormError(null);
                          setShowGenerateNextChallanModal(true);
                        }}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1.5 shadow-md shadow-emerald-600/30"
                      >
                        <FileSpreadsheet className="w-4 h-4" />
                        <span>Generate Next Challan</span>
                      </button>
                    )}

                    <button
                      onClick={handleOpenEditStudent}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition flex items-center space-x-1"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-slate-400" />
                      <span>Edit Details</span>
                    </button>

                    <button
                      onClick={() => setSelectedStudentId(null)}
                      className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Section C: Financial Metrics Ribbon (Only for Financial Roles) */}
                {isFinancialUser && profileData.fee_overview && (
                  <div className="bg-slate-900 px-4 py-2.5 border-b border-slate-800 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 text-center text-xs shrink-0">
                    <div className="bg-slate-800/80 p-2 rounded-lg border border-slate-700/60">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">Total Package</span>
                      <strong className="text-white font-mono text-sm">
                        Rs. {Number(profileData.fee_overview.total_agreed_package_fee).toLocaleString()}
                      </strong>
                    </div>

                    <div className="bg-slate-800/80 p-2 rounded-lg border border-slate-700/60">
                      <span className="text-[10px] text-emerald-400 uppercase font-semibold block">Total Paid</span>
                      <strong className="text-emerald-400 font-mono text-sm">
                        Rs. {Number(profileData.fee_overview.total_qualifying_package_payments).toLocaleString()}
                      </strong>
                    </div>

                    <div className="bg-slate-800/80 p-2 rounded-lg border border-slate-700/60">
                      <span className="text-[10px] text-amber-400 uppercase font-semibold block">Package Balance</span>
                      <strong className="text-amber-400 font-mono text-sm">
                        Rs. {Number(profileData.fee_overview.remaining_package_balance).toLocaleString()}
                      </strong>
                    </div>

                    <div className="bg-slate-800/80 p-2 rounded-lg border border-slate-700/60">
                      <span className="text-[10px] text-rose-400 uppercase font-semibold block">Outstanding Invoices</span>
                      <strong className="text-rose-400 font-mono text-sm">
                        Rs. {Number(profileData.fee_overview.total_outstanding_invoice_balance).toLocaleString()}
                      </strong>
                    </div>

                    <div className="bg-slate-800/80 p-2 rounded-lg border border-slate-700/60">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">Billing Cycle Fee</span>
                      <strong className="text-white font-mono text-sm">
                        Rs. {Number(profileData.fee_overview.current_cycle_amount).toLocaleString()}
                      </strong>
                    </div>

                    <div className="bg-slate-800/80 p-2 rounded-lg border border-slate-700/60">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">Next Due Date</span>
                      <strong className="text-indigo-300 font-mono text-xs">
                        {profileData.fee_overview.next_eligible_due_date || 'All Paid Up'}
                      </strong>
                    </div>
                  </div>
                )}

                {/* Tab Navigation */}
                <div className="bg-white border-b border-slate-200 px-4 flex space-x-4 text-xs font-bold shrink-0">
                  <button
                    onClick={() => setProfileActiveTab('overview')}
                    className={`py-3 border-b-2 transition flex items-center space-x-1.5 ${
                      profileActiveTab === 'overview'
                        ? 'border-indigo-600 text-indigo-700'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <BookOpen className="w-4 h-4" />
                    <span>Identity & Academic</span>
                  </button>

                  <button
                    onClick={() => setProfileActiveTab('attendance')}
                    className={`py-3 border-b-2 transition flex items-center space-x-1.5 ${
                      profileActiveTab === 'attendance'
                        ? 'border-indigo-600 text-indigo-700'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <CalendarCheck className="w-4 h-4" />
                    <span>Attendance ({studentAttendance?.summary ? `${studentAttendance.summary.attendance_percentage}%` : '0%'})</span>
                  </button>

                  {isFinancialUser && (
                    <>
                      <button
                        onClick={() => setProfileActiveTab('challans')}
                        className={`py-3 border-b-2 transition flex items-center space-x-1.5 ${
                          profileActiveTab === 'challans'
                            ? 'border-indigo-600 text-indigo-700'
                            : 'border-transparent text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        <FileSpreadsheet className="w-4 h-4" />
                        <span>Challan History ({profileData.challans?.length || 0})</span>
                      </button>

                      <button
                        onClick={() => setProfileActiveTab('payments')}
                        className={`py-3 border-b-2 transition flex items-center space-x-1.5 ${
                          profileActiveTab === 'payments'
                            ? 'border-indigo-600 text-indigo-700'
                            : 'border-transparent text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        <Receipt className="w-4 h-4" />
                        <span>Payment History ({profileData.payments?.length || 0})</span>
                      </button>

                      <button
                        onClick={() => setProfileActiveTab('ledger')}
                        className={`py-3 border-b-2 transition flex items-center space-x-1.5 ${
                          profileActiveTab === 'ledger'
                            ? 'border-indigo-600 text-indigo-700'
                            : 'border-transparent text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        <FileText className="w-4 h-4" />
                        <span>Chronological Fee Ledger</span>
                      </button>
                    </>
                  )}

                  {isAdmin && (
                    <button
                      onClick={() => setProfileActiveTab('audit')}
                      className={`py-3 border-b-2 transition flex items-center space-x-1.5 ${
                        profileActiveTab === 'audit'
                          ? 'border-indigo-600 text-indigo-700'
                          : 'border-transparent text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      <History className="w-4 h-4" />
                      <span>Audit Activity ({profileData.audit_activity?.length || 0})</span>
                    </button>
                  )}
                </div>

                {/* Tab Workspace Panels */}
                <div className="flex-1 overflow-y-auto p-5 bg-slate-50">
                  {/* TAB 1: Identity & Academic Placement */}
                  {profileActiveTab === 'overview' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Section A: Student Identity */}
                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
                        <h4 className="font-bold text-xs uppercase tracking-wider text-slate-800 flex items-center space-x-1.5 pb-2 border-b border-slate-100">
                          <Users className="w-4 h-4 text-indigo-600" />
                          <span>Student Identity & Contact Details</span>
                        </h4>

                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <span className="text-slate-400 block text-[10px] uppercase">Full Name</span>
                            <strong className="text-slate-900">{profileData.student.full_name}</strong>
                          </div>

                          <div>
                            <span className="text-slate-400 block text-[10px] uppercase">Roll Number</span>
                            <strong className="font-mono text-indigo-700">{profileData.student.roll_number}</strong>
                          </div>

                          <div>
                            <span className="text-slate-400 block text-[10px] uppercase">Father / Guardian</span>
                            <strong className="text-slate-900">{profileData.student.father_name}</strong>
                          </div>

                          <div>
                            <span className="text-slate-400 block text-[10px] uppercase">Guardian Phone</span>
                            <strong className="font-mono text-slate-800">{profileData.student.guardian_phone}</strong>
                          </div>

                          <div>
                            <span className="text-slate-400 block text-[10px] uppercase">Admission Date</span>
                            <strong className="font-mono text-slate-800">{profileData.student.admission_date}</strong>
                          </div>

                          <div>
                            <span className="text-slate-400 block text-[10px] uppercase">Enrollment Status</span>
                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800">
                              {profileData.student.status}
                            </span>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-100 text-xs">
                          <span className="text-slate-400 block text-[10px] uppercase">Residential Address</span>
                          <p className="text-slate-700">{profileData.student.address || 'No address recorded.'}</p>
                        </div>

                        {profileData.student.notes && (
                          <div className="pt-2 border-t border-slate-100 text-xs">
                            <span className="text-slate-400 block text-[10px] uppercase">Special Notes</span>
                            <p className="text-slate-600 bg-slate-50 p-2 rounded border border-slate-200">
                              {profileData.student.notes}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Section B: Academic Placement */}
                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
                        <h4 className="font-bold text-xs uppercase tracking-wider text-slate-800 flex items-center space-x-1.5 pb-2 border-b border-slate-100">
                          <Briefcase className="w-4 h-4 text-indigo-600" />
                          <span>Academic Program & Placement</span>
                        </h4>

                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <span className="text-slate-400 block text-[10px] uppercase">Degree Program</span>
                            <strong className="text-slate-900">{profileData.academic.program_name}</strong>
                          </div>

                          <div>
                            <span className="text-slate-400 block text-[10px] uppercase">Program Code</span>
                            <strong className="font-mono text-indigo-700">{profileData.academic.program_code}</strong>
                          </div>

                          <div>
                            <span className="text-slate-400 block text-[10px] uppercase">Class & Section</span>
                            <strong className="text-slate-900">
                              {profileData.academic.class_name} (Sec {profileData.academic.class_section || 'A'})
                            </strong>
                          </div>

                          <div>
                            <span className="text-slate-400 block text-[10px] uppercase">Academic Session</span>
                            <strong className="text-slate-900">{profileData.academic.session_name}</strong>
                          </div>

                          <div>
                            <span className="text-slate-400 block text-[10px] uppercase">Session Start Date</span>
                            <span className="font-mono text-slate-600">{profileData.academic.session_start_date}</span>
                          </div>

                          <div>
                            <span className="text-slate-400 block text-[10px] uppercase">Session End Date</span>
                            <span className="font-mono text-slate-600">{profileData.academic.session_end_date}</span>
                          </div>
                        </div>

                        {/* Scholarship / Discount Summary if available */}
                        {isFinancialUser && profileData.fee_overview && (
                          <div className="pt-3 border-t border-slate-100">
                            <span className="text-slate-400 block text-[10px] uppercase mb-1">Scholarship / Merit Concession</span>
                            <div className="p-2.5 bg-indigo-50 border border-indigo-200 rounded-lg text-xs font-semibold text-indigo-900 flex items-center space-x-2">
                              <BadgePercent className="w-4 h-4 text-indigo-600" />
                              <span>{profileData.fee_overview.scholarship_summary}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* TAB: Attendance Statistics & Chronological History */}
                  {profileActiveTab === 'attendance' && (
                    <div className="space-y-4">
                      {/* Attendance Summary KPIs */}
                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-3 border-b border-slate-100 gap-2">
                          <div>
                            <h4 className="font-bold text-xs uppercase tracking-wider text-slate-800 flex items-center space-x-1.5">
                              <CalendarCheck className="w-4 h-4 text-indigo-600" />
                              <span>Student Attendance Performance Record</span>
                            </h4>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              Institutional attendance record tracked in Asia/Karachi operational timezone.
                            </p>
                          </div>

                          {studentAttendance?.summary && (
                            <div className="flex items-center space-x-2">
                              <span className="text-xs text-slate-500 font-semibold">Overall Attendance:</span>
                              <span
                                className={`px-2.5 py-1 rounded-lg font-mono font-bold text-sm ${
                                  studentAttendance.summary.attendance_percentage >= 75
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                    : 'bg-rose-100 text-rose-800 border border-rose-300'
                                }`}
                              >
                                {studentAttendance.summary.attendance_percentage}%
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Progress Bar & Threshold Warning */}
                        {studentAttendance?.summary && (
                          <div className="mb-4">
                            <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                              <div
                                className={`h-2.5 rounded-full transition-all duration-500 ${
                                  studentAttendance.summary.attendance_percentage >= 75
                                    ? 'bg-emerald-500'
                                    : 'bg-rose-500'
                                }`}
                                style={{ width: `${Math.min(100, Math.max(0, studentAttendance.summary.attendance_percentage))}%` }}
                              />
                            </div>
                            {studentAttendance.summary.attendance_percentage < 75 && studentAttendance.summary.total_sessions > 0 && (
                              <div className="mt-2 p-2 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center space-x-2">
                                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                                <span>
                                  <strong>Low Attendance Notice:</strong> This student is currently below the mandatory 75% institutional attendance threshold.
                                </span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Metrics Breakdown Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
                          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                            <span className="text-[10px] text-slate-500 uppercase font-semibold block">Total Sessions</span>
                            <span className="font-mono text-base font-bold text-slate-800">
                              {studentAttendance?.summary?.total_sessions || 0}
                            </span>
                          </div>

                          <div className="bg-emerald-50 p-2.5 rounded-lg border border-emerald-200">
                            <span className="text-[10px] text-emerald-700 uppercase font-semibold block">Present</span>
                            <span className="font-mono text-base font-bold text-emerald-700">
                              {studentAttendance?.summary?.present || 0}
                            </span>
                          </div>

                          <div className="bg-rose-50 p-2.5 rounded-lg border border-rose-200">
                            <span className="text-[10px] text-rose-700 uppercase font-semibold block">Absent</span>
                            <span className="font-mono text-base font-bold text-rose-700">
                              {studentAttendance?.summary?.absent || 0}
                            </span>
                          </div>

                          <div className="bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                            <span className="text-[10px] text-amber-700 uppercase font-semibold block">Late</span>
                            <span className="font-mono text-base font-bold text-amber-700">
                              {studentAttendance?.summary?.late || 0}
                            </span>
                          </div>

                          <div className="bg-indigo-50 p-2.5 rounded-lg border border-indigo-200">
                            <span className="text-[10px] text-indigo-700 uppercase font-semibold block">Excused</span>
                            <span className="font-mono text-base font-bold text-indigo-700">
                              {studentAttendance?.summary?.excused || 0}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Chronological History Log */}
                      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                            Daily Session History Log ({studentAttendance?.history?.length || 0})
                          </span>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="border-b border-slate-200 text-slate-500 bg-slate-100/60 font-semibold">
                                <th className="p-2.5">Date</th>
                                <th className="p-2.5 text-center">Status</th>
                                <th className="p-2.5">Arrival Time</th>
                                <th className="p-2.5">Marked By</th>
                                <th className="p-2.5 text-center">Session State</th>
                                <th className="p-2.5">Remarks / Corrections</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium">
                              {!studentAttendance?.history || studentAttendance.history.length === 0 ? (
                                <tr>
                                  <td colSpan={6} className="p-6 text-center text-slate-400">
                                    No attendance records found for this student.
                                  </td>
                                </tr>
                              ) : (
                                studentAttendance.history.map((record, idx) => (
                                  <tr key={idx} className="hover:bg-slate-50 transition">
                                    <td className="p-2.5 font-mono text-slate-800 font-bold">
                                      {record.attendance_date}
                                    </td>
                                    <td className="p-2.5 text-center">
                                      <span
                                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                          record.status === 'present'
                                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                            : record.status === 'absent'
                                            ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                            : record.status === 'late'
                                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                            : 'bg-indigo-100 text-indigo-800 border border-indigo-300'
                                        }`}
                                      >
                                        {record.status}
                                      </span>
                                    </td>
                                    <td className="p-2.5 font-mono text-slate-600">
                                      {record.arrival_time || '-'}
                                    </td>
                                    <td className="p-2.5 text-slate-700">
                                      {record.marked_by_name || 'System'}
                                    </td>
                                    <td className="p-2.5 text-center">
                                      <span
                                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                          record.is_finalized
                                            ? 'bg-slate-100 text-slate-700 border border-slate-300'
                                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                                        }`}
                                      >
                                        {record.is_finalized ? 'LOCKED' : 'OPEN'}
                                      </span>
                                    </td>
                                    <td className="p-2.5 text-slate-600">
                                      {record.correction_reason ? (
                                        <div className="text-[11px] text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                          <strong>Admin Correction:</strong> {record.correction_reason}
                                        </div>
                                      ) : (
                                        record.notes || '-'
                                      )}
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB 2: Challan History (Section D) */}
                  {profileActiveTab === 'challans' && isFinancialUser && (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                          Issued Fee Invoices & Challans ({profileData.challans?.length || 0})
                        </span>
                        <button
                          onClick={() => {
                            setChallanGenResult(null);
                            setFormError(null);
                            setShowGenerateNextChallanModal(true);
                          }}
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold transition flex items-center space-x-1"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Generate Next Challan</span>
                        </button>
                      </div>

                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-100 text-slate-700 uppercase font-bold text-[10px]">
                          <tr>
                            <th className="p-2.5">Challan #</th>
                            <th className="p-2.5">Billing Period</th>
                            <th className="p-2.5">Issue Date</th>
                            <th className="p-2.5">Due Date</th>
                            <th className="p-2.5 text-right">Cycle Fee</th>
                            <th className="p-2.5 text-right">Arrears</th>
                            <th className="p-2.5 text-right">Net Payable</th>
                            <th className="p-2.5 text-right">Amount Paid</th>
                            <th className="p-2.5 text-right">Remaining Balance</th>
                            <th className="p-2.5 text-center">Status</th>
                            <th className="p-2.5 text-center">Print</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium">
                          {!profileData.challans || profileData.challans.length === 0 ? (
                            <tr>
                              <td colSpan={11} className="p-6 text-center text-slate-400">
                                No fee challans issued for this student yet.
                              </td>
                            </tr>
                          ) : (
                            profileData.challans.map((inv) => (
                              <tr key={inv.id} className="hover:bg-slate-50 transition">
                                <td className="p-2.5 font-mono font-bold text-indigo-700">{inv.challan_no}</td>
                                <td className="p-2.5 font-mono text-slate-700">{inv.billing_period}</td>
                                <td className="p-2.5 font-mono text-slate-600">{inv.issue_date}</td>
                                <td className="p-2.5 font-mono text-slate-600">{inv.due_date}</td>
                                <td className="p-2.5 text-right font-mono">
                                  Rs. {Number(inv.current_cycle_fee).toLocaleString()}
                                </td>
                                <td className="p-2.5 text-right font-mono text-rose-600">
                                  Rs. {Number(inv.arrears_carried_forward).toLocaleString()}
                                </td>
                                <td className="p-2.5 text-right font-mono font-bold text-slate-900">
                                  Rs. {Number(inv.net_payable).toLocaleString()}
                                </td>
                                <td className="p-2.5 text-right font-mono text-emerald-600">
                                  Rs. {Number(inv.amount_paid).toLocaleString()}
                                </td>
                                <td className="p-2.5 text-right font-mono font-bold text-rose-600">
                                  Rs. {Number(inv.remaining_invoice_balance).toLocaleString()}
                                </td>
                                <td className="p-2.5 text-center">
                                  <span
                                    className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                                      inv.status === 'paid'
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : inv.status === 'partially_paid'
                                        ? 'bg-amber-100 text-amber-800'
                                        : 'bg-rose-100 text-rose-800'
                                    }`}
                                  >
                                    {inv.status}
                                  </span>
                                </td>
                                <td className="p-2.5 text-center">
                                  <button
                                    onClick={() => handlePrintChallan(inv)}
                                    title="Print 3-Copy A4 Landscape Challan PDF"
                                    className="p-1 bg-white hover:bg-indigo-50 border border-slate-300 hover:border-indigo-300 text-indigo-600 rounded transition"
                                  >
                                    <Printer className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* TAB 3: Payment History (Section E) */}
                  {profileActiveTab === 'payments' && isFinancialUser && (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="p-3 bg-slate-50 border-b border-slate-200">
                        <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                          Recorded Fee Payments & Receipts ({profileData.payments?.length || 0})
                        </span>
                      </div>

                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-100 text-slate-700 uppercase font-bold text-[10px]">
                          <tr>
                            <th className="p-2.5">Receipt #</th>
                            <th className="p-2.5">Challan #</th>
                            <th className="p-2.5">Payment Date</th>
                            <th className="p-2.5">Method</th>
                            <th className="p-2.5">Authorized Cashier</th>
                            <th className="p-2.5 text-right">Amount Received</th>
                            <th className="p-2.5 text-center">Receipt</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium">
                          {!profileData.payments || profileData.payments.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="p-6 text-center text-slate-400">
                                No payments recorded for this student yet.
                              </td>
                            </tr>
                          ) : (
                            profileData.payments.map((p) => (
                              <tr key={p.id} className="hover:bg-slate-50 transition">
                                <td className="p-2.5 font-mono font-bold text-slate-900">{p.receipt_no}</td>
                                <td className="p-2.5 font-mono text-slate-500">{p.challan_no}</td>
                                <td className="p-2.5 font-mono">{p.payment_date}</td>
                                <td className="p-2.5 capitalize">{p.payment_method}</td>
                                <td className="p-2.5 text-slate-700">{p.cashier_name || p.cashier_username}</td>
                                <td className="p-2.5 text-right font-mono font-bold text-emerald-600">
                                  Rs. {Number(p.amount).toLocaleString()}
                                </td>
                                <td className="p-2.5 text-center">
                                  <button
                                    onClick={() => handlePrintReceipt(p)}
                                    title="Reprint 80mm Counter Receipt"
                                    className="p-1 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded transition"
                                  >
                                    <Printer className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* TAB 4: Chronological Fee Ledger (Section F) */}
                  {profileActiveTab === 'ledger' && isFinancialUser && (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="p-3 bg-slate-900 text-white flex items-center justify-between">
                        <div>
                          <h4 className="font-bold text-xs uppercase tracking-wider flex items-center space-x-1.5">
                            <FileText className="w-4 h-4 text-indigo-400" />
                            <span>Chronological Statement of Accounts</span>
                          </h4>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            Reconciles invoice charges (debit) and payments (credit) to calculate running balance.
                          </p>
                        </div>
                      </div>

                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-100 text-slate-700 uppercase font-bold text-[10px]">
                          <tr>
                            <th className="p-2.5">Date</th>
                            <th className="p-2.5">Transaction Type</th>
                            <th className="p-2.5">Reference #</th>
                            <th className="p-2.5">Description</th>
                            <th className="p-2.5 text-right">Debit (Fee Charges)</th>
                            <th className="p-2.5 text-right">Credit (Payments)</th>
                            <th className="p-2.5 text-right">Running Balance</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium">
                          {!profileData.ledger || profileData.ledger.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="p-6 text-center text-slate-400">
                                No ledger events recorded.
                              </td>
                            </tr>
                          ) : (
                            profileData.ledger.map((entry, idx) => (
                              <tr key={idx} className="hover:bg-slate-50 transition">
                                <td className="p-2.5 font-mono text-slate-600">{entry.date}</td>
                                <td className="p-2.5 font-mono">
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                      entry.type === 'INVOICE_CHARGE'
                                        ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                        : entry.type === 'PAYMENT'
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                        : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                    }`}
                                  >
                                    {entry.type}
                                  </span>
                                </td>
                                <td className="p-2.5 font-mono text-slate-800">{entry.reference}</td>
                                <td className="p-2.5 text-slate-700">{entry.description}</td>
                                <td className="p-2.5 text-right font-mono text-rose-600">
                                  {entry.debit > 0 ? `Rs. ${entry.debit.toLocaleString()}` : '-'}
                                </td>
                                <td className="p-2.5 text-right font-mono text-emerald-600">
                                  {entry.credit > 0 ? `Rs. ${entry.credit.toLocaleString()}` : '-'}
                                </td>
                                <td className="p-2.5 text-right font-mono font-bold text-slate-900">
                                  Rs. {entry.running_balance.toLocaleString()}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* TAB 5: Audit Activity Trail (Section H) */}
                  {profileActiveTab === 'audit' && isAdmin && (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="p-3 bg-slate-50 border-b border-slate-200">
                        <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                          Immutable Student Audit Log
                        </span>
                      </div>

                      <div className="divide-y divide-slate-100 text-xs">
                        {!profileData.audit_activity || profileData.audit_activity.length === 0 ? (
                          <div className="p-6 text-center text-slate-400">No audit events recorded for this student.</div>
                        ) : (
                          profileData.audit_activity.map((log: any) => (
                            <div key={log.id} className="p-3 hover:bg-slate-50 transition flex items-start justify-between">
                              <div>
                                <div className="flex items-center space-x-2">
                                  <span className="font-bold text-slate-900">{log.action}</span>
                                  <span className="px-1.5 py-0.2 bg-slate-100 rounded text-[10px] text-slate-600 font-mono">
                                    {log.event_type}
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-500 mt-0.5">
                                  Performed by <strong>{log.actor_name}</strong> ({log.role}) on workstation{' '}
                                  <span className="font-mono">{log.workstation_id}</span>
                                </p>
                              </div>
                              <span className="font-mono text-[10px] text-slate-400">{log.created_at}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* MODAL: Generate Next Eligible Challan */}
      {showGenerateNextChallanModal && profileData && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-4 bg-emerald-900 text-white flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center space-x-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                <span>Generate Challan for {profileData.student.full_name}</span>
              </h3>
              <button onClick={() => setShowGenerateNextChallanModal(false)} className="text-emerald-300 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {formError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center space-x-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {challanGenResult ? (
                <div className="space-y-3">
                  <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-center">
                    <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto mb-1" />
                    <h5 className="font-bold text-xs text-emerald-900">Challan Generated!</h5>
                    <p className="text-xs text-emerald-700">{challanGenResult.message}</p>
                  </div>

                  <button
                    onClick={() => {
                      setShowGenerateNextChallanModal(false);
                      setChallanGenResult(null);
                    }}
                    className="w-full py-2 bg-slate-800 text-white rounded-lg text-xs font-bold"
                  >
                    Close
                  </button>
                </div>
              ) : (
                <form onSubmit={handleGenerateNextChallan} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Billing Month / Period *</label>
                      <input
                        type="text"
                        required
                        value={nextChallanPeriod}
                        onChange={(e) => setNextChallanPeriod(e.target.value)}
                        placeholder="e.g. 2026-04"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-bold"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Due Date *</label>
                      <input
                        type="date"
                        required
                        value={nextChallanDueDate}
                        onChange={(e) => setNextChallanDueDate(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 pt-1">
                    <input
                      type="checkbox"
                      id="incArrearsStudent"
                      checked={nextChallanIncludeArrears}
                      onChange={(e) => setNextChallanIncludeArrears(e.target.checked)}
                      className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                    />
                    <label htmlFor="incArrearsStudent" className="text-xs text-slate-700 font-medium">
                      Carry forward unpaid arrears into this challan
                    </label>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg text-[11px] text-slate-500 border border-slate-200">
                    <ShieldCheck className="w-3.5 h-3.5 inline mr-1 text-emerald-600" />
                    Enforces idempotency: Will skip generation if already billed for period{' '}
                    <strong>{nextChallanPeriod}</strong>.
                  </div>

                  <div className="flex justify-end space-x-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowGenerateNextChallanModal(false)}
                      className="px-4 py-2 border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-md shadow-emerald-600/30"
                    >
                      {isSubmitting ? 'Generating...' : 'Generate Challan'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Edit Student Profile Details */}
      {showEditStudentModal && profileData && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center space-x-2">
                <Edit2 className="w-4 h-4 text-indigo-400" />
                <span>Edit Student Record</span>
              </h3>
              <button onClick={() => setShowEditStudentModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEditStudentSubmit} className="p-5 space-y-3.5">
              {formError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center space-x-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Father's Name *</label>
                  <input
                    type="text"
                    required
                    value={editFatherName}
                    onChange={(e) => setEditFatherName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Guardian Phone *</label>
                  <input
                    type="text"
                    required
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Class Assignment</label>
                  <select
                    value={editClassId}
                    onChange={(e) => setEditClassId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                  >
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Enrollment Status</label>
                  <select
                    value={editStatus}
                    onChange={(e: any) => setEditStatus(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                  >
                    <option value="active">Active</option>
                    <option value="graduated">Graduated</option>
                    <option value="suspended">Suspended</option>
                    <option value="withdrawn">Withdrawn</option>
                    <option value="struck_off">Struck Off</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Residential Address</label>
                <input
                  type="text"
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Administrative Notes</label>
                <textarea
                  rows={2}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditStudentModal(false)}
                  className="px-4 py-2 border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition shadow-md"
                >
                  {isSubmitting ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: New Student Admission */}
      {showAdmitModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-bold text-sm tracking-tight flex items-center space-x-2">
                <UserPlus className="w-4 h-4 text-indigo-400" />
                <span>Admit New Student & Configure Agreed Fee Plan</span>
              </h3>
              <button
                onClick={() => setShowAdmitModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAdmitStudent} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Student Identity */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Roll Number *</label>
                  <input
                    type="text"
                    required
                    value={rollNumber}
                    onChange={(e) => setRollNumber(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Student Full Name *</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Father / Guardian Name *</label>
                  <input
                    type="text"
                    required
                    value={fatherName}
                    onChange={(e) => setFatherName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Guardian Phone *</label>
                  <input
                    type="text"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono"
                  />
                </div>
              </div>

              {/* Academic Placement */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Academic Session *</label>
                  <select
                    value={selectedSessionId}
                    onChange={(e) => setSelectedSessionId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                  >
                    {sessions.map((sess) => (
                      <option key={sess.id} value={sess.id}>
                        {sess.name} {sess.is_active === 1 ? '(Active)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Program *</label>
                  <select
                    value={selectedProgramId}
                    onChange={(e) => setSelectedProgramId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                  >
                    {programs.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} - {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Class Section *</label>
                  <select
                    value={selectedClassId}
                    onChange={(e) => setSelectedClassId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                  >
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Fee Plan Configuration */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 border-t border-slate-100 pt-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Billing Plan *</label>
                  <select
                    value={billingPlan}
                    onChange={(e: any) => setBillingPlan(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                  >
                    <option value="monthly">Monthly Fee Plan</option>
                    <option value="installment">Installment Plan</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Total Agreed Package (PKR) *</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={totalPackageFee}
                    onChange={(e) => setTotalPackageFee(parseInt(e.target.value, 10) || 0)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Monthly Tuition Fee (PKR)</label>
                  <input
                    type="number"
                    min="0"
                    value={monthlyTuitionFee}
                    onChange={(e) => setMonthlyTuitionFee(parseInt(e.target.value, 10) || 0)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-bold"
                  />
                </div>
              </div>

              {/* Scholarships */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border-t border-slate-100 pt-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Scholarship Type</label>
                  <select
                    value={scholarshipType}
                    onChange={(e: any) => setScholarshipType(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                  >
                    <option value="none">No Scholarship</option>
                    <option value="percentage">Percentage Discount (%)</option>
                    <option value="fixed">Fixed Monthly Concession (PKR)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Scholarship Value {scholarshipType === 'percentage' ? '(%)' : '(PKR)'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={scholarshipType === 'percentage' ? 100 : totalPackageFee}
                    value={scholarshipValue}
                    onChange={(e) => setScholarshipValue(parseInt(e.target.value, 10) || 0)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-bold"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAdmitModal(false)}
                  className="px-4 py-2 border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition shadow-md shadow-indigo-600/20"
                >
                  {isSubmitting ? 'Admitting...' : 'Admit Student'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
