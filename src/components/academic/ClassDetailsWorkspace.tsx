import React, { useState, useEffect, useMemo } from 'react';
import { apiRequest } from '../../lib/apiClient';
import { useAuth } from '../../context/AuthContext';
import { CollegeClass } from '../../types';

import {
  ArrowLeft,
  Users,
  DollarSign,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Search,
  Filter,
  Printer,
  FileSpreadsheet,
  FileText,
  Calendar,
  Eye,
  Phone,
  X,
  Layers,
  Sparkles,
  TrendingUp,
} from 'lucide-react';


export interface ClassDetailsStudent {
  id: string;
  roll_number: string;
  full_name: string;
  father_name: string;
  guardian_phone: string;
  admission_date: string;
  status: string;
  billing_plan?: string;
  agreed_package_fee?: number;
  amount_paid?: number;
  remaining_balance?: number;
  current_invoice_amount?: number | null;
  current_invoice_balance?: number | null;
  current_invoice_due_date?: string | null;
  latest_challan_no?: string | null;
  has_fee_plan?: boolean;
  payment_status?: 'paid' | 'partially_paid' | 'unpaid' | 'overdue' | 'review_required';
}

export interface ClassFinancialSummary {
  total_enrolled: number;
  total_agreed_fee: number;
  total_collected: number;
  total_remaining_balance: number;
  students_with_balance: number;
  students_fully_paid: number;
  students_overdue: number;
  students_review_required: number;
}

interface ClassDetailsWorkspaceProps {
  classId: string;
  onBack: () => void;
  onNavigateToAttendance?: (classId: string) => void;
  onOpenStudentProfile?: (studentId: string) => void;
}

export const ClassDetailsWorkspace: React.FC<ClassDetailsWorkspaceProps> = ({
  classId,
  onBack,
  onNavigateToAttendance,
  onOpenStudentProfile,
}) => {
  const { hasRole } = useAuth();
  const isFinancialUser = hasRole('admin', 'fee_manager');

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [classInfo, setClassInfo] = useState<CollegeClass | null>(null);
  const [financialSummary, setFinancialSummary] = useState<ClassFinancialSummary | null>(null);
  const [students, setStudents] = useState<ClassDetailsStudent[]>([]);
  const [feeStructures, setFeeStructures] = useState<any[]>([]);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>('all');
  const [enrollmentStatusFilter, setEnrollmentStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'roll_asc' | 'roll_desc' | 'name_asc' | 'balance_desc' | 'paid_desc'>('roll_asc');

  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  // Modals
  const [showClassChallanModal, setShowClassChallanModal] = useState<boolean>(false);
  const [challanBillingPeriod, setChallanBillingPeriod] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [challanDueDate, setChallanDueDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 10);
    return d.toISOString().split('T')[0];
  });
  const [includeArrears, setIncludeArrears] = useState<boolean>(true);
  const [isGeneratingChallans, setIsGeneratingChallans] = useState<boolean>(false);
  const [challanResult, setChallanResult] = useState<any | null>(null);
  const [challanError, setChallanError] = useState<string | null>(null);

  // Student Ledger Quick View Modal
  const [selectedStudentForLedger, setSelectedStudentForLedger] = useState<ClassDetailsStudent | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState<boolean>(false);
  const [studentLedgerData, setStudentLedgerData] = useState<any | null>(null);

  // Student Attendance Quick View Modal
  const [selectedStudentForAttendance, setSelectedStudentForAttendance] = useState<ClassDetailsStudent | null>(null);
  const [attendanceLoading, setAttendanceLoading] = useState<boolean>(false);
  const [studentAttendanceData, setStudentAttendanceData] = useState<any | null>(null);

  useEffect(() => {
    loadClassData();
  }, [classId]);

  const loadClassData = async () => {
    setIsLoading(true);
    setError(null);
    setClassInfo(null);
    setFinancialSummary(null);
    setStudents([]);
    try {
      const res = await apiRequest<{
        success: boolean;
        class: CollegeClass;
        financial_summary: ClassFinancialSummary | null;
        students: ClassDetailsStudent[];
        feeStructures: any[];
      }>(`/college/classes/${classId}`);

      if (res.success) {
        setClassInfo(res.class);
        setFinancialSummary(res.financial_summary);
        setStudents(res.students || []);
        setFeeStructures(res.feeStructures || []);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load class details');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadClassData();
  };

  const formatPKR = (amount?: number | null) => {
    if (amount === undefined || amount === null) return '—';
    return `Rs. ${Number(amount).toLocaleString()}`;
  };

  // Filtered & Sorted Students
  const filteredStudents = useMemo(() => {
    let result = [...students];

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (s) =>
          s.roll_number.toLowerCase().includes(q) ||
          s.full_name.toLowerCase().includes(q) ||
          (s.father_name && s.father_name.toLowerCase().includes(q)) ||
          (s.guardian_phone && s.guardian_phone.includes(q))
      );
    }

    // Payment status filter
    if (paymentStatusFilter !== 'all') {
      result = result.filter((s) => s.payment_status === paymentStatusFilter);
    }

    // Enrollment status filter
    if (enrollmentStatusFilter !== 'all') {
      result = result.filter((s) => s.status === enrollmentStatusFilter);
    }

    // Sorting
    result.sort((a, b) => {
      switch (sortBy) {
        case 'roll_asc':
          return a.roll_number.localeCompare(b.roll_number, undefined, { numeric: true });
        case 'roll_desc':
          return b.roll_number.localeCompare(a.roll_number, undefined, { numeric: true });
        case 'name_asc':
          return a.full_name.localeCompare(b.full_name);
        case 'balance_desc':
          return (b.remaining_balance || 0) - (a.remaining_balance || 0);
        case 'paid_desc':
          return (b.amount_paid || 0) - (a.amount_paid || 0);
        default:
          return 0;
      }
    });

    return result;
  }, [students, searchQuery, paymentStatusFilter, enrollmentStatusFilter, sortBy]);

  // Paginated Students
  const paginatedStudents = useMemo(() => {
    if (pageSize === -1) return filteredStudents;
    const startIndex = (currentPage - 1) * pageSize;
    return filteredStudents.slice(startIndex, startIndex + pageSize);
  }, [filteredStudents, currentPage, pageSize]);

  const totalPages = pageSize === -1 ? 1 : Math.ceil(filteredStudents.length / pageSize);

  // Handle Class Challan Generation
  const handleGenerateClassChallans = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!classInfo) return;

    setIsGeneratingChallans(true);
    setChallanError(null);
    setChallanResult(null);

    try {
      const res = await apiRequest<{
        success: boolean;
        message: string;
        summary: any;
      }>('/challans/generate', {
        method: 'POST',
        body: JSON.stringify({
          scope: 'single_class',
          class_id: classInfo.id,
          academic_session_id: classInfo.academic_session_id,
          billing_period: challanBillingPeriod,
          due_date: challanDueDate,
          include_arrears: includeArrears,
        }),
      });

      if (res.success) {
        setChallanResult(res.summary);
        loadClassData(); // Refresh data with updated challans
      }
    } catch (err: any) {
      setChallanError(err.message || 'Failed to generate challans for class');
    } finally {
      setIsGeneratingChallans(false);
    }
  };

  // Handle Single Student Challan Generation
  const handleGenerateSingleStudentChallan = async (student: ClassDetailsStudent) => {
    if (!classInfo) return;
    if (
      !confirm(
        `Generate individual challan for ${student.full_name} (${student.roll_number}) for period ${challanBillingPeriod}?`
      )
    ) {
      return;
    }

    try {
      const res = await apiRequest<{
        success: boolean;
        message: string;
        summary: any;
      }>('/challans/generate', {
        method: 'POST',
        body: JSON.stringify({
          scope: 'single_student',
          student_id: student.id,
          academic_session_id: classInfo.academic_session_id,
          billing_period: challanBillingPeriod,
          due_date: challanDueDate,
          include_arrears: true,
        }),
      });

      if (res.success) {
        alert(
          `Challan generated for ${student.full_name}! Total Billed: Rs. ${Number(
            res.summary?.total_billed_amount || 0
          ).toLocaleString()}`
        );
        loadClassData();
      }
    } catch (err: any) {
      alert(`Challan generation failed: ${err.message}`);
    }
  };


  // View Student Ledger Quick Modal
  const handleOpenLedger = async (student: ClassDetailsStudent) => {
    setSelectedStudentForLedger(student);
    setLedgerLoading(true);
    setStudentLedgerData(null);

    try {
      const res = await apiRequest<{ success: boolean; data: any }>(`/students/${student.id}/profile`);
      if (res.success) {
        setStudentLedgerData(res.data);
      }
    } catch (err) {
      console.error('Failed to load student ledger:', err);
    } finally {
      setLedgerLoading(false);
    }
  };

  // View Student Attendance Quick Modal
  const handleOpenAttendance = async (student: ClassDetailsStudent) => {
    setSelectedStudentForAttendance(student);
    setAttendanceLoading(true);
    setStudentAttendanceData(null);

    try {
      const res = await apiRequest<{ success: boolean; history: any[]; summary: any }>(
        `/attendance/student/${student.id}`
      );
      if (res.success) {
        setStudentAttendanceData(res);
      }
    } catch (err) {
      console.error('Failed to load student attendance:', err);
    } finally {
      setAttendanceLoading(false);
    }
  };

  // Print Roster
  const handlePrintRoster = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 bg-slate-50">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4" />
        <h3 className="text-base font-bold text-slate-800">Loading Class Details...</h3>
        <p className="text-xs text-slate-500 mt-1">Zakariya Educational Complex — Computing class rosters & ledgers...</p>
      </div>
    );
  }

  if (error || !classInfo) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 bg-slate-50">
        <div className="p-4 bg-rose-100 text-rose-700 rounded-full mb-3">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h3 className="text-base font-bold text-slate-900">Unable to Open Class</h3>
        <p className="text-xs text-slate-600 max-w-md text-center mt-1 mb-4">{error || 'Class not found.'}</p>
        <button
          onClick={onBack}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Classes & Sessions</span>
        </button>
      </div>
    );
  }

  const collectionPercent =
    financialSummary && financialSummary.total_agreed_fee > 0
      ? Math.min(100, Math.round((financialSummary.total_collected / financialSummary.total_agreed_fee) * 100))
      : 0;

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden select-text">
      {/* Top Header Bar */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0 shadow-sm">
        <div className="flex items-center space-x-4 min-w-0">
          <button
            onClick={onBack}
            title="Return to Classes & Sessions"
            className="p-2 hover:bg-slate-100 text-slate-600 rounded-xl transition flex items-center justify-center border border-slate-200"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="min-w-0">
            <div className="flex items-center space-x-2 text-xs text-slate-500 mb-0.5">
              <span>Academic Workspace</span>
              <span>/</span>
              <span>Classes & Sessions</span>
              <span>/</span>
              <span className="font-mono text-indigo-600 font-semibold">{classInfo.program_code}</span>
            </div>
            <div className="flex items-center space-x-3">
              <h1 className="text-lg font-bold text-slate-900 truncate flex items-center space-x-2">
                <span>{classInfo.name}</span>
                <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-xs font-mono font-bold rounded-md border border-slate-200">
                  Sec {classInfo.section || 'A'}
                </span>
              </h1>
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] font-bold capitalize ${
                  classInfo.status === 'active'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-slate-100 text-slate-600 border border-slate-300'
                }`}
              >
                {classInfo.status}
              </span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-2 shrink-0">
          <div className="text-right hidden sm:block mr-2 text-xs">
            <div className="text-slate-500">Academic Session</div>
            <div className="font-bold text-slate-800 font-mono">{classInfo.session_name}</div>
          </div>

          <button
            onClick={handleRefresh}
            title="Refresh Class Data"
            className="p-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg transition"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-indigo-600' : ''}`} />
          </button>

          <button
            onClick={handlePrintRoster}
            title="Print Enrolled Student Roster"
            className="px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition"
          >
            <Printer className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Print Roster</span>
          </button>

          {isFinancialUser && (
            <button
              onClick={() => {
                setChallanResult(null);
                setChallanError(null);
                setShowClassChallanModal(true);
              }}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center space-x-1.5 transition shadow-sm shadow-indigo-600/30"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Generate Class Challans</span>
            </button>
          )}

          {onNavigateToAttendance && (
            <button
              onClick={() => onNavigateToAttendance(classInfo.id)}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center space-x-1.5 transition shadow-sm shadow-emerald-600/30"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Mark Attendance</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Class Metadata Sub-banner */}
        <div className="bg-indigo-950 text-indigo-100 rounded-xl px-5 py-3 shadow-md flex flex-wrap items-center justify-between gap-4 border border-indigo-900 text-xs">
          <div className="flex items-center space-x-6">
            <div>
              <span className="text-indigo-300 block text-[10px] uppercase font-bold tracking-wider">Program</span>
              <span className="font-semibold text-white">
                {classInfo.program_name} ({classInfo.program_code})
              </span>
            </div>
            <div className="h-6 w-px bg-indigo-800" />
            <div>
              <span className="text-indigo-300 block text-[10px] uppercase font-bold tracking-wider">Class Identifier</span>
              <span className="font-mono text-indigo-200 font-bold">{classInfo.id}</span>
            </div>
            <div className="h-6 w-px bg-indigo-800" />
            <div>
              <span className="text-indigo-300 block text-[10px] uppercase font-bold tracking-wider">Enrolled Students</span>
              <span className="font-bold text-white font-mono">{students.length} Total</span>
            </div>
            {isFinancialUser && (
              <>
                <div className="h-6 w-px bg-indigo-800" />
                <div>
                  <span className="text-indigo-300 block text-[10px] uppercase font-bold tracking-wider">Default Monthly Fee</span>
                  <span className="font-mono text-emerald-400 font-bold">
                    Rs. {Number(classInfo.default_monthly_fee || 0).toLocaleString()}
                  </span>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center space-x-2 text-[11px] text-indigo-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Scope: {classInfo.session_name}</span>
          </div>
        </div>

        {/* Financial KPI Summary Cards (Financial roles only) */}
        {isFinancialUser && financialSummary ? (
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
                <DollarSign className="w-3.5 h-3.5 text-indigo-600" />
                <span>Class Financial Summary (PKR)</span>
              </h2>
              <span className="text-[11px] text-slate-500 italic">
                *Calculated from confirmed non-reversed receipts and agreed packages
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card 1: Total Agreed Obligation */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
                <div className="flex items-center justify-between text-slate-500 mb-1">
                  <span className="text-xs font-bold uppercase tracking-wider">Total Agreed Fee</span>
                  <Layers className="w-4 h-4 text-indigo-500" />
                </div>
                <div className="text-xl font-bold font-mono text-slate-900">
                  {formatPKR(financialSummary.total_agreed_fee)}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Across {financialSummary.total_enrolled} enrolled students
                </div>
              </div>

              {/* Card 2: Total Collected */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
                <div className="flex items-center justify-between text-slate-500 mb-1">
                  <span className="text-xs font-bold uppercase tracking-wider">Total Collected</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                </div>
                <div className="text-xl font-bold font-mono text-emerald-700">
                  {formatPKR(financialSummary.total_collected)}
                </div>
                <div className="mt-2">
                  <div className="flex items-center justify-between text-[10px] text-slate-600 mb-1">
                    <span>Recovery Rate</span>
                    <span className="font-bold font-mono">{collectionPercent}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${collectionPercent}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Card 3: Remaining Balance */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
                <div className="flex items-center justify-between text-slate-500 mb-1">
                  <span className="text-xs font-bold uppercase tracking-wider">Remaining Balance</span>
                  <TrendingUp className="w-4 h-4 text-amber-500" />
                </div>
                <div
                  className={`text-xl font-bold font-mono ${
                    financialSummary.total_remaining_balance > 0 ? 'text-amber-700' : 'text-emerald-700'
                  }`}
                >
                  {formatPKR(financialSummary.total_remaining_balance)}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  {financialSummary.students_with_balance} students with outstanding balances
                </div>
              </div>

              {/* Card 4: Health Breakdown */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Account Statuses
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center justify-between p-1.5 bg-emerald-50 text-emerald-900 rounded-lg">
                    <span className="font-semibold">Fully Paid:</span>
                    <span className="font-mono font-bold">{financialSummary.students_fully_paid}</span>
                  </div>
                  <div className="flex items-center justify-between p-1.5 bg-amber-50 text-amber-900 rounded-lg">
                    <span className="font-semibold">Balance:</span>
                    <span className="font-mono font-bold">{financialSummary.students_with_balance}</span>
                  </div>
                  <div className="flex items-center justify-between p-1.5 bg-rose-50 text-rose-900 rounded-lg">
                    <span className="font-semibold">Overdue:</span>
                    <span className="font-mono font-bold">{financialSummary.students_overdue}</span>
                  </div>
                  <div className="flex items-center justify-between p-1.5 bg-purple-50 text-purple-900 rounded-lg">
                    <span className="font-semibold">Review:</span>
                    <span className="font-mono font-bold">{financialSummary.students_review_required}</span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        ) : (
          /* Academic Staff Overview Card for Teachers */
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-indigo-50 text-indigo-700 rounded-xl">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Academic Class Roster</h3>
                <p className="text-xs text-slate-500">
                  Assigned class roster for {classInfo.name} ({classInfo.session_name}). Total {students.length} enrolled students.
                </p>
              </div>
            </div>
            <div className="text-right font-mono text-xs text-slate-600">
              Active: <strong className="text-emerald-600">{students.filter((s) => s.status === 'active').length}</strong> | 
              Other: <strong className="text-slate-700">{students.filter((s) => s.status !== 'active').length}</strong>
            </div>
          </div>
        )}

        {/* Student Table Section */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          {/* Table Header / Filters Bar */}
          <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3 shrink-0">
            {/* Search Input */}
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search by roll no, student or guardian..."
                className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Filter Dropdowns */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {isFinancialUser && (
                <div className="flex items-center space-x-1">
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-slate-500 font-medium">Payment:</span>
                  <select
                    value={paymentStatusFilter}
                    onChange={(e) => {
                      setPaymentStatusFilter(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 font-medium outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="all">All Payment Statuses</option>
                    <option value="paid">Paid</option>
                    <option value="partially_paid">Partially Paid</option>
                    <option value="unpaid">Unpaid</option>
                    <option value="overdue">Overdue</option>
                    <option value="review_required">Review Required</option>
                  </select>
                </div>
              )}

              <div className="flex items-center space-x-1">
                <span className="text-slate-500 font-medium">Enrollment:</span>
                <select
                  value={enrollmentStatusFilter}
                  onChange={(e) => {
                    setEnrollmentStatusFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 font-medium outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="all">All Enrolled</option>
                  <option value="active">Active Only</option>
                  <option value="graduated">Graduated</option>
                  <option value="withdrawn">Withdrawn</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>

              <div className="flex items-center space-x-1">
                <span className="text-slate-500 font-medium">Sort:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 font-medium outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="roll_asc">Roll Number (Asc)</option>
                  <option value="roll_desc">Roll Number (Desc)</option>
                  <option value="name_asc">Student Name (A-Z)</option>
                  {isFinancialUser && (
                    <>
                      <option value="balance_desc">Remaining Balance (High-Low)</option>
                      <option value="paid_desc">Amount Paid (High-Low)</option>
                    </>
                  )}
                </select>
              </div>

              {(searchQuery || paymentStatusFilter !== 'all' || enrollmentStatusFilter !== 'all') && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setPaymentStatusFilter('all');
                    setEnrollmentStatusFilter('all');
                    setCurrentPage(1);
                  }}
                  className="px-2 py-1 text-indigo-600 hover:text-indigo-800 text-xs font-semibold underline"
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>

          {/* Student Roster Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/75 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                  <th className="p-3 w-10 text-center">#</th>
                  <th className="p-3">Roll Number</th>
                  <th className="p-3">Student & Father Name</th>
                  <th className="p-3">Guardian Contact</th>
                  <th className="p-3 text-center">Status</th>
                  {isFinancialUser && (
                    <>
                      <th className="p-3 text-right">Agreed Package</th>
                      <th className="p-3 text-right">Amount Paid</th>
                      <th className="p-3 text-right">Remaining Bal</th>
                      <th className="p-3 text-right">Current Cycle</th>
                      <th className="p-3 text-center">Payment Status</th>
                    </>
                  )}
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedStudents.length === 0 ? (
                  <tr>
                    <td
                      colSpan={isFinancialUser ? 11 : 6}
                      className="p-12 text-center text-slate-400 font-medium"
                    >
                      <Users className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                      <div>No students found matching your criteria in this class.</div>
                    </td>
                  </tr>
                ) : (
                  paginatedStudents.map((std, idx) => {
                    const rowNumber = (currentPage - 1) * (pageSize === -1 ? 0 : pageSize) + idx + 1;
                    return (
                      <tr key={std.id} className="hover:bg-indigo-50/40 transition">
                        <td className="p-3 text-center text-slate-400 font-mono text-[11px]">
                          {rowNumber}
                        </td>

                        <td className="p-3 font-mono font-bold text-slate-900">
                          <div>{std.roll_number}</div>
                          <div className="text-[10px] text-slate-400 font-normal">Adm: {std.admission_date}</div>
                        </td>

                        <td className="p-3">
                          <div className="font-bold text-slate-900">{std.full_name}</div>
                          <div className="text-[11px] text-slate-500 font-medium">{std.father_name || '—'}</div>
                        </td>

                        <td className="p-3 font-mono text-[11px] text-slate-700">
                          {std.guardian_phone ? (
                            <a
                              href={`tel:${std.guardian_phone}`}
                              className="text-indigo-600 hover:text-indigo-800 flex items-center space-x-1"
                            >
                              <Phone className="w-3 h-3 text-slate-400" />
                              <span>{std.guardian_phone}</span>
                            </a>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        <td className="p-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold capitalize ${
                              std.status === 'active'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}
                          >
                            {std.status}
                          </span>
                        </td>

                        {isFinancialUser && (
                          <>
                            <td className="p-3 text-right font-mono font-semibold text-slate-800">
                              {std.agreed_package_fee !== undefined
                                ? formatPKR(std.agreed_package_fee)
                                : '—'}
                            </td>

                            <td className="p-3 text-right font-mono font-bold text-emerald-700">
                              {std.amount_paid !== undefined ? formatPKR(std.amount_paid) : '—'}
                            </td>

                            <td className="p-3 text-right font-mono font-bold">
                              <span
                                className={
                                  (std.remaining_balance || 0) > 0 ? 'text-amber-700' : 'text-slate-400'
                                }
                              >
                                {std.remaining_balance !== undefined
                                  ? formatPKR(std.remaining_balance)
                                  : '—'}
                              </span>
                            </td>

                            <td className="p-3 text-right font-mono text-[11px]">
                              {std.current_invoice_balance !== null && std.current_invoice_balance !== undefined ? (
                                <div>
                                  <div className="font-bold text-slate-800">
                                    {formatPKR(std.current_invoice_balance)}
                                  </div>
                                  {std.current_invoice_due_date && (
                                    <div className="text-[10px] text-slate-500">
                                      Due: {std.current_invoice_due_date}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-400 text-[10px]">No active invoice</span>
                              )}
                            </td>

                            <td className="p-3 text-center">
                              {std.payment_status === 'paid' && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                  Paid
                                </span>
                              )}
                              {std.payment_status === 'partially_paid' && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-300">
                                  Partially Paid
                                </span>
                              )}
                              {std.payment_status === 'unpaid' && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-300">
                                  Unpaid
                                </span>
                              )}
                              {std.payment_status === 'overdue' && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300 animate-pulse">
                                  Overdue
                                </span>
                              )}
                              {std.payment_status === 'review_required' && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-300">
                                  Plan Needed
                                </span>
                              )}
                            </td>
                          </>
                        )}

                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center space-x-1">
                            {onOpenStudentProfile && (
                              <button
                                onClick={() => onOpenStudentProfile(std.id)}
                                title="Open Full Student Profile"
                                className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded transition"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {isFinancialUser && (
                              <>
                                <button
                                  onClick={() => handleOpenLedger(std)}
                                  title="View Fee Ledger & Invoices"
                                  className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded text-[10px] font-bold transition"
                                >
                                  Ledger
                                </button>

                                <button
                                  onClick={() => handleGenerateSingleStudentChallan(std)}
                                  title="Generate Single Challan"
                                  className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded transition"
                                >
                                  <FileSpreadsheet className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}

                            <button
                              onClick={() => handleOpenAttendance(std)}
                              title="Inspect Attendance History"
                              className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded transition"
                            >
                              <Calendar className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Table Footer with Pagination */}
          <div className="p-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
            <div>
              Showing <strong className="text-slate-800">{filteredStudents.length}</strong> enrolled students
              {searchQuery || paymentStatusFilter !== 'all' || enrollmentStatusFilter !== 'all'
                ? ` (filtered from ${students.length} total)`
                : ''}
            </div>

            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-1">
                <span>Rows:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="px-2 py-1 bg-white border border-slate-200 rounded text-xs text-slate-700 outline-none"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={-1}>All</option>
                </select>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center space-x-1">
                  <button
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="px-2.5 py-1 bg-white border border-slate-200 rounded text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100"
                  >
                    Prev
                  </button>
                  <span className="px-2 font-mono">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="px-2.5 py-1 bg-white border border-slate-200 rounded text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Applicable Fee Structures (Financial Users Only) */}
        {isFinancialUser && feeStructures.length > 0 && (
          <section className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
              <FileText className="w-3.5 h-3.5 text-indigo-600" />
              <span>Configured Fee Structures for {classInfo.name}</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {feeStructures.map((fs) => (
                <div key={fs.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                  <div className="font-bold text-slate-800">{fs.fee_head_name || fs.fee_head}</div>
                  <div className="text-sm font-bold font-mono text-indigo-700 mt-1">
                    Rs. {Number(fs.amount).toLocaleString()}
                  </div>
                  <div className="text-[10px] text-slate-500 capitalize mt-0.5">
                    Frequency: {fs.billing_frequency}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: Class Challan Generation Workflow */}
      {/* ========================================================================= */}
      {showClassChallanModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 bg-indigo-950 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                <h3 className="font-bold text-sm">Generate Challans: {classInfo.name}</h3>
              </div>
              <button
                onClick={() => setShowClassChallanModal(false)}
                className="text-indigo-300 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleGenerateClassChallans} className="p-6 space-y-4">
              {challanError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{challanError}</span>
                </div>
              )}

              {challanResult && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
                  <div className="flex items-center space-x-2 text-emerald-800 font-bold text-xs">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Challan Generation Complete!</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-700">
                    <div>
                      Generated: <strong className="text-emerald-700">{challanResult.generated}</strong>
                    </div>
                    <div>
                      Skipped (Duplicate): <strong className="text-slate-700">{challanResult.skipped_duplicate}</strong>
                    </div>
                    <div>
                      Total Billed:{' '}
                      <strong className="text-slate-900 font-mono">
                        Rs. {Number(challanResult.total_billed_amount || 0).toLocaleString()}
                      </strong>
                    </div>
                    <div>
                      Failed: <strong className="text-rose-600">{challanResult.failed || 0}</strong>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Billing Period</label>
                  <input
                    type="text"
                    required
                    value={challanBillingPeriod}
                    onChange={(e) => setChallanBillingPeriod(e.target.value)}
                    placeholder="e.g. 2026-10"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Format: YYYY-MM</span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Due Date</label>
                  <input
                    type="date"
                    required
                    value={challanDueDate}
                    onChange={(e) => setChallanDueDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="includeArrears"
                  checked={includeArrears}
                  onChange={(e) => setIncludeArrears(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                <label htmlFor="includeArrears" className="text-xs text-slate-700 font-medium cursor-pointer">
                  Include previous outstanding arrears in newly issued challans
                </label>
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowClassChallanModal(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={isGeneratingChallans}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1.5 disabled:opacity-50"
                >
                  {isGeneratingChallans ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Generating...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Generate Challans</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: Student Fee Ledger Quick View Modal */}
      {/* ========================================================================= */}
      {selectedStudentForLedger && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[85vh]">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-bold text-sm flex items-center space-x-2">
                  <span>{selectedStudentForLedger.full_name}</span>
                  <span className="font-mono text-xs px-2 py-0.5 bg-slate-800 text-indigo-300 rounded">
                    {selectedStudentForLedger.roll_number}
                  </span>
                </h3>
                <div className="text-[11px] text-slate-400">Class Fee Ledger & Payment History</div>
              </div>
              <button
                onClick={() => setSelectedStudentForLedger(null)}
                className="text-slate-400 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              {ledgerLoading ? (
                <div className="text-center py-8 text-slate-400">Loading ledger records...</div>
              ) : studentLedgerData ? (
                <>
                  {/* Financial Overview Cards */}
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">Total Agreed Package</span>
                      <span className="text-base font-bold font-mono text-slate-900">
                        {formatPKR(studentLedgerData.fee_overview?.total_agreed_package_fee)}
                      </span>
                    </div>
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <span className="text-emerald-700 block text-[10px] uppercase font-bold">Total Paid</span>
                      <span className="text-base font-bold font-mono text-emerald-800">
                        {formatPKR(studentLedgerData.fee_overview?.total_qualifying_package_payments)}
                      </span>
                    </div>
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <span className="text-amber-700 block text-[10px] uppercase font-bold">Remaining Balance</span>
                      <span className="text-base font-bold font-mono text-amber-800">
                        {formatPKR(studentLedgerData.fee_overview?.remaining_package_balance)}
                      </span>
                    </div>
                  </div>

                  {/* Issued Challans Table */}
                  <div>
                    <h4 className="text-xs font-bold text-slate-700 uppercase mb-2">Issued Challans / Invoices</h4>
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                          <tr>
                            <th className="p-2">Challan #</th>
                            <th className="p-2">Period</th>
                            <th className="p-2">Due Date</th>
                            <th className="p-2 text-right">Amount</th>
                            <th className="p-2 text-right">Remaining</th>
                            <th className="p-2 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {studentLedgerData.challans?.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="p-4 text-center text-slate-400">
                                No issued challans found.
                              </td>
                            </tr>
                          ) : (
                            studentLedgerData.challans?.map((c: any) => (
                              <tr key={c.id}>
                                <td className="p-2 font-mono font-bold text-slate-900">{c.challan_no}</td>
                                <td className="p-2 font-mono">{c.billing_period}</td>
                                <td className="p-2 font-mono">{c.due_date}</td>
                                <td className="p-2 text-right font-mono">{formatPKR(c.net_payable)}</td>
                                <td className="p-2 text-right font-mono font-bold text-amber-700">
                                  {formatPKR(c.remaining_invoice_balance)}
                                </td>
                                <td className="p-2 text-center">
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                                    {c.status}
                                  </span>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Payments Table */}
                  <div>
                    <h4 className="text-xs font-bold text-slate-700 uppercase mb-2">Payment Receipts</h4>
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                          <tr>
                            <th className="p-2">Receipt #</th>
                            <th className="p-2">Date</th>
                            <th className="p-2">Method</th>
                            <th className="p-2 text-right">Amount Paid</th>
                            <th className="p-2 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {studentLedgerData.payments?.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="p-4 text-center text-slate-400">
                                No payments recorded yet.
                              </td>
                            </tr>
                          ) : (
                            studentLedgerData.payments?.map((p: any) => (
                              <tr key={p.id}>
                                <td className="p-2 font-mono font-bold text-slate-900">{p.receipt_no}</td>
                                <td className="p-2 font-mono">{p.payment_date}</td>
                                <td className="p-2 capitalize">{p.payment_method}</td>
                                <td className="p-2 text-right font-mono font-bold text-emerald-700">
                                  {formatPKR(p.amount)}
                                </td>
                                <td className="p-2 text-center">
                                  {p.is_reversed === 1 ? (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
                                      Reversed
                                    </span>
                                  ) : (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                      Confirmed
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-6 text-slate-400">Unable to load ledger details.</div>
              )}
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                onClick={() => setSelectedStudentForLedger(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold"
              >
                Close Ledger
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: Student Attendance History Modal */}
      {/* ========================================================================= */}
      {selectedStudentForAttendance && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[80vh]">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-bold text-sm flex items-center space-x-2">
                  <span>{selectedStudentForAttendance.full_name}</span>
                  <span className="font-mono text-xs px-2 py-0.5 bg-slate-800 text-indigo-300 rounded">
                    {selectedStudentForAttendance.roll_number}
                  </span>
                </h3>
                <div className="text-[11px] text-slate-400">Attendance Records</div>
              </div>
              <button
                onClick={() => setSelectedStudentForAttendance(null)}
                className="text-slate-400 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              {attendanceLoading ? (
                <div className="text-center py-8 text-slate-400">Loading attendance history...</div>
              ) : studentAttendanceData ? (
                <>
                  {studentAttendanceData.summary && (
                    <div className="grid grid-cols-4 gap-2 text-center text-xs">
                      <div className="p-2 bg-emerald-50 rounded-lg">
                        <span className="text-[10px] text-emerald-700 block font-bold">Present</span>
                        <strong className="text-emerald-900 text-sm font-mono">
                          {studentAttendanceData.summary.present || 0}
                        </strong>
                      </div>
                      <div className="p-2 bg-rose-50 rounded-lg">
                        <span className="text-[10px] text-rose-700 block font-bold">Absent</span>
                        <strong className="text-rose-900 text-sm font-mono">
                          {studentAttendanceData.summary.absent || 0}
                        </strong>
                      </div>
                      <div className="p-2 bg-amber-50 rounded-lg">
                        <span className="text-[10px] text-amber-700 block font-bold">Late</span>
                        <strong className="text-amber-900 text-sm font-mono">
                          {studentAttendanceData.summary.late || 0}
                        </strong>
                      </div>
                      <div className="p-2 bg-blue-50 rounded-lg">
                        <span className="text-[10px] text-blue-700 block font-bold">Excused</span>
                        <strong className="text-blue-900 text-sm font-mono">
                          {studentAttendanceData.summary.excused || 0}
                        </strong>
                      </div>
                    </div>
                  )}

                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                        <tr>
                          <th className="p-2">Date</th>
                          <th className="p-2">Status</th>
                          <th className="p-2">Remarks</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {studentAttendanceData.history?.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="p-4 text-center text-slate-400">
                              No attendance recorded for this student.
                            </td>
                          </tr>
                        ) : (
                          studentAttendanceData.history?.map((att: any) => (
                            <tr key={att.id}>
                              <td className="p-2 font-mono font-medium text-slate-800">{att.attendance_date}</td>
                              <td className="p-2">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold capitalize ${
                                    att.status === 'present'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : att.status === 'absent'
                                      ? 'bg-rose-100 text-rose-800'
                                      : att.status === 'late'
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-blue-100 text-blue-800'
                                  }`}
                                >
                                  {att.status}
                                </span>
                              </td>
                              <td className="p-2 text-slate-500 text-[11px]">{att.remarks || '—'}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="text-center py-6 text-slate-400">No records available.</div>
              )}
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                onClick={() => setSelectedStudentForAttendance(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
