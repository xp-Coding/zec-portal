import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../lib/apiClient';
import { FeeInvoice, AcademicSession, CollegeClass, CollegeSettings } from '../../types';
import { generateChallanPDF } from '../../lib/pdfGenerator';
import {
  FileSpreadsheet,
  Layers,
  GraduationCap,
  User,
  Building,
  Printer,
  CheckCircle2,
  AlertTriangle,
  Search,
} from 'lucide-react';

export const ChallanManager: React.FC = () => {
  // Data State
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [classes, setClasses] = useState<CollegeClass[]>([]);
  const [collegeSettings, setCollegeSettings] = useState<CollegeSettings | null>(null);
  const [challans, setChallans] = useState<FeeInvoice[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Filter State
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  // Generation Modal State
  const [showGenModal, setShowGenModal] = useState<boolean>(false);
  const [scope, setScope] = useState<'entire_college' | 'single_class' | 'single_student'>('entire_college');
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [studentRollInput, setStudentRollInput] = useState<string>('');
  const [searchedStudent, setSearchedStudent] = useState<any | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [billingMode, setBillingMode] = useState<'monthly' | 'installment'>('monthly');
  const [dueDate, setDueDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(10); // default due day 10
    return d.toISOString().split('T')[0];
  });
  const [includeArrears, setIncludeArrears] = useState<boolean>(true);

  // Generation Progress & Result State
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [genResult, setGenResult] = useState<any | null>(null);
  const [genError, setGenError] = useState<string | null>(null);

  useEffect(() => {
    loadInitialData();
    loadChallans();
  }, []);

  const loadInitialData = async () => {
    try {
      const [sessRes, classRes, setRes] = await Promise.all([
        apiRequest<{ success: boolean; sessions: AcademicSession[] }>('/college/sessions'),
        apiRequest<{ success: boolean; classes: CollegeClass[] }>('/college/classes'),
        apiRequest<{ success: boolean; settings: CollegeSettings }>('/college/settings'),
      ]);

      if (sessRes.success) {
        setSessions(sessRes.sessions);
        const active = sessRes.sessions.find((s) => s.is_active === 1) || sessRes.sessions[0];
        if (active) setSelectedSessionId(active.id);
      }
      if (classRes.success) {
        setClasses(classRes.classes);
        if (classRes.classes.length > 0) setSelectedClassId(classRes.classes[0].id);
      }
      if (setRes.success) {
        setCollegeSettings(setRes.settings);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadChallans = async () => {
    setIsLoading(true);
    try {
      const res = await apiRequest<{ success: boolean; challans: FeeInvoice[] }>('/challans', {
        params: { search: searchFilter, status: statusFilter, limit: 50 },
      });
      if (res.success) setChallans(res.challans);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  // Search student when in single_student mode
  const handleStudentSearch = async () => {
    if (!studentRollInput.trim()) return;
    try {
      const res = await apiRequest<{ success: boolean; student: any }>(`/students/lookup/${studentRollInput.trim()}`);
      if (res.success && res.student) {
        setSearchedStudent(res.student);
      }
    } catch {
      setSearchedStudent(null);
      alert(`Student with roll number '${studentRollInput}' not found`);
    }
  };

  // Execute Generation
  const handleRunGeneration = async () => {
    setIsGenerating(true);
    setGenResult(null);
    setGenError(null);

    try {
      const payload: any = {
        scope,
        academic_session_id: selectedSessionId,
        billing_period: billingPeriod,
        billing_mode: billingMode,
        due_date: dueDate,
        include_arrears: includeArrears,
      };

      if (scope === 'single_class') {
        payload.class_id = selectedClassId;
      } else if (scope === 'single_student') {
        if (!searchedStudent) {
          throw new Error('Please search and select a student first.');
        }
        payload.student_id = searchedStudent.id;
      }

      const res = await apiRequest<{ success: boolean; summary: any; challans: any[] }>('/challans/generate', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (res.success) {
        setGenResult(res);
        loadChallans();
      }
    } catch (err: any) {
      setGenError(err.message || 'Challan generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  // Print 3-Copy A4 PDF
  const handlePrintChallan = async (invoiceId: string) => {
    try {
      const res = await apiRequest<{ success: boolean; challan: FeeInvoice; college: CollegeSettings }>(
        `/challans/${invoiceId}`
      );
      if (res.success && res.challan) {
        const pdf = generateChallanPDF({
          invoice: res.challan,
          college: res.college || collegeSettings!,
        });
        pdf.save(`Challan_${res.challan.challan_no}_3Copy.pdf`);
      }
    } catch (err: any) {
      alert(`Could not print challan: ${err.message}`);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      {/* Top Header */}
      <div className="p-4 bg-white border-b border-slate-200 shadow-sm flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center space-x-2">
            <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
            <span>Challan Management & Invoicing</span>
          </h2>
          <p className="text-xs text-slate-500">
            One-Click Challan Generation Engine, Duplicate Prevention & 3-Copy A4 Printing
          </p>
        </div>

        <button
          onClick={() => {
            setShowGenModal(true);
            setGenResult(null);
            setGenError(null);
          }}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-lg shadow-md transition flex items-center space-x-1.5"
        >
          <Layers className="w-4 h-4" />
          <span>One-Click Generate Challans</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 bg-white border-b border-slate-200 flex flex-wrap gap-3 items-center justify-between">
        <div className="flex items-center space-x-3 flex-1 min-w-[280px]">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by Challan #, Roll #, or Student Name..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadChallans()}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-700"
          >
            <option value="">All Statuses</option>
            <option value="unpaid">Unpaid</option>
            <option value="partially_paid">Partially Paid</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
          </select>
          <button
            onClick={loadChallans}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition"
          >
            Filter
          </button>
        </div>

        <div className="text-xs text-slate-500">
          Showing <strong>{challans.length}</strong> invoices
        </div>
      </div>

      {/* Challans Table */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900 text-white font-semibold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="p-3">Challan #</th>
                <th className="p-3">Student Details</th>
                <th className="p-3">Class / Program</th>
                <th className="p-3">Period</th>
                <th className="p-3 text-right">Package Fee</th>
                <th className="p-3 text-right">Cycle Fee</th>
                <th className="p-3 text-right">Net Payable</th>
                <th className="p-3 text-right">Paid</th>
                <th className="p-3 text-right">Balance</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {isLoading ? (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-slate-400">
                    Loading challans...
                  </td>
                </tr>
              ) : challans.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-slate-400">
                    No challans found. Click "One-Click Generate Challans" to issue invoices.
                  </td>
                </tr>
              ) : (
                challans.map((ch) => (
                  <tr key={ch.id} className="hover:bg-slate-50 transition">
                    <td className="p-3 font-mono font-bold text-indigo-700">{ch.challan_no}</td>
                    <td className="p-3">
                      <div className="font-bold text-slate-900">{ch.full_name}</div>
                      <div className="text-[11px] text-slate-500 font-mono">Roll: {ch.roll_number}</div>
                    </td>
                    <td className="p-3 text-slate-600">
                      <div>{ch.class_name}</div>
                      <div className="text-[10px] text-slate-400">{ch.program_name}</div>
                    </td>
                    <td className="p-3 font-mono text-slate-600">{ch.billing_period}</td>
                    <td className="p-3 text-right font-mono text-slate-700">
                      Rs. {Number(ch.total_package_fee).toLocaleString()}
                    </td>
                    <td className="p-3 text-right font-mono text-slate-700">
                      Rs. {Number(ch.current_cycle_fee).toLocaleString()}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-slate-900">
                      Rs. {Number(ch.net_payable).toLocaleString()}
                    </td>
                    <td className="p-3 text-right font-mono text-emerald-600">
                      Rs. {Number(ch.amount_paid).toLocaleString()}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-rose-600">
                      Rs. {Number(ch.remaining_invoice_balance).toLocaleString()}
                    </td>
                    <td className="p-3 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold capitalize ${
                          ch.status === 'paid'
                            ? 'bg-emerald-100 text-emerald-800'
                            : ch.status === 'partially_paid'
                            ? 'bg-indigo-100 text-indigo-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {ch.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => handlePrintChallan(ch.id)}
                        title="Print 3-Copy A4 Challan"
                        className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold rounded text-[11px] transition inline-flex items-center space-x-1"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Print</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Generation Engine Modal */}
      {showGenModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm tracking-tight flex items-center space-x-2">
                  <Layers className="w-4 h-4 text-indigo-400" />
                  <span>One-Click Challan Generation Engine</span>
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  Select scope, verify billing rules, and generate standardized challans
                </p>
              </div>
              <button
                onClick={() => setShowGenModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Scope Selector Tabs */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  1. Generation Scope
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setScope('entire_college')}
                    className={`p-3 rounded-lg border text-left transition ${
                      scope === 'entire_college'
                        ? 'bg-indigo-50 border-indigo-500 ring-2 ring-indigo-500/20'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <Building className="w-4 h-4 text-indigo-600 mb-1" />
                    <strong className="block text-xs text-slate-900">Entire College</strong>
                    <span className="text-[10px] text-slate-500">All active classes in session</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setScope('single_class')}
                    className={`p-3 rounded-lg border text-left transition ${
                      scope === 'single_class'
                        ? 'bg-indigo-50 border-indigo-500 ring-2 ring-indigo-500/20'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <GraduationCap className="w-4 h-4 text-indigo-600 mb-1" />
                    <strong className="block text-xs text-slate-900">Single Class</strong>
                    <span className="text-[10px] text-slate-500">One specific class roster</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setScope('single_student')}
                    className={`p-3 rounded-lg border text-left transition ${
                      scope === 'single_student'
                        ? 'bg-indigo-50 border-indigo-500 ring-2 ring-indigo-500/20'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <User className="w-4 h-4 text-indigo-600 mb-1" />
                    <strong className="block text-xs text-slate-900">Single Student</strong>
                    <span className="text-[10px] text-slate-500">Individual roll number</span>
                  </button>
                </div>
              </div>

              {/* Scope-dependent Target Selectors */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Academic Session *
                  </label>
                  <select
                    value={selectedSessionId}
                    onChange={(e) => setSelectedSessionId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                  >
                    {sessions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.is_active === 1 ? '(Active Session)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {scope === 'single_class' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Target Class *
                    </label>
                    <select
                      value={selectedClassId}
                      onChange={(e) => setSelectedClassId(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                    >
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.program_name})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {scope === 'single_student' && (
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Search Student by Roll Number *
                    </label>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        placeholder="Enter roll number..."
                        value={studentRollInput}
                        onChange={(e) => setStudentRollInput(e.target.value)}
                        className="flex-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono"
                      />
                      <button
                        type="button"
                        onClick={handleStudentSearch}
                        className="px-4 py-2 bg-slate-800 text-white rounded-lg text-xs font-medium"
                      >
                        Verify
                      </button>
                    </div>

                    {searchedStudent && (
                      <div className="mt-2 p-2.5 bg-indigo-50 border border-indigo-200 rounded-lg text-xs">
                        <strong>{searchedStudent.full_name}</strong> (Roll: {searchedStudent.roll_number}) | Class: {searchedStudent.class_name} | Package: Rs. {Number(searchedStudent.total_package_fee).toLocaleString()}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Billing Parameters */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 border-t border-slate-100 pt-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Billing Mode *
                  </label>
                  <select
                    value={billingMode}
                    onChange={(e: any) => setBillingMode(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="installment">Installment</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Billing Period (Month) *
                  </label>
                  <input
                    type="month"
                    value={billingPeriod}
                    onChange={(e) => setBillingPeriod(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Due Date *
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono"
                  />
                </div>

                <div className="flex items-center pt-5">
                  <label className="flex items-center space-x-2 text-xs font-medium text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeArrears}
                      onChange={(e) => setIncludeArrears(e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                    />
                    <span>Include Prior Arrears</span>
                  </label>
                </div>
              </div>

              {/* Error Alert */}
              {genError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{genError}</span>
                </div>
              )}

              {/* Batch Generation Summary Results */}
              {genResult && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
                  <div className="flex items-center space-x-2 text-emerald-800 font-bold text-xs">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Batch Execution Completed Successfully!</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-slate-700 pt-1">
                    <div className="bg-white p-2 rounded border border-emerald-100">
                      <span className="text-[10px] text-slate-500 block">Total Eligible</span>
                      <strong className="font-mono text-sm">{genResult.summary.total_eligible}</strong>
                    </div>
                    <div className="bg-white p-2 rounded border border-emerald-100">
                      <span className="text-[10px] text-emerald-600 block">Generated</span>
                      <strong className="font-mono text-sm text-emerald-700">{genResult.summary.generated}</strong>
                    </div>
                    <div className="bg-white p-2 rounded border border-emerald-100">
                      <span className="text-[10px] text-amber-600 block">Skipped (Duplicate)</span>
                      <strong className="font-mono text-sm text-amber-700">{genResult.summary.skipped_duplicate}</strong>
                    </div>
                    <div className="bg-white p-2 rounded border border-emerald-100">
                      <span className="text-[10px] text-slate-500 block">Total Billed (PKR)</span>
                      <strong className="font-mono text-sm">Rs. {Number(genResult.summary.total_billed_amount).toLocaleString()}</strong>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowGenModal(false)}
                className="px-4 py-2 border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold"
              >
                Close
              </button>

              <button
                type="button"
                onClick={handleRunGeneration}
                disabled={isGenerating}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold text-xs rounded-lg shadow-md transition flex items-center space-x-1.5"
              >
                <Layers className="w-4 h-4" />
                <span>{isGenerating ? 'Processing Batch...' : 'Execute One-Click Generation'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
