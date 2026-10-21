import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiRequest } from '../../lib/apiClient';
import { Student, FeeInvoice, FeePayment, CollegeSettings } from '../../types';
import { generateReceiptPDF } from '../../lib/pdfGenerator';
import {
  Search,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  Printer,
  RotateCcw,
  Clock,
  User,
} from 'lucide-react';

export const QuickFeeCounter: React.FC = () => {
  const { user, workstationId } = useAuth();
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Search & Student State
  const [rollNumberInput, setRollNumberInput] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [student, setStudent] = useState<Student | null>(null);
  const [unpaidInvoices, setUnpaidInvoices] = useState<FeeInvoice[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<FeeInvoice | null>(null);
  const [collegeSettings, setCollegeSettings] = useState<CollegeSettings | null>(null);

  // Payment Form State
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer' | 'cheque' | 'online'>('cash');
  const [referenceNo, setReferenceNo] = useState<string>('');
  const [paymentNotes, setPaymentNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Cashier History
  const [recentPayments, setRecentPayments] = useState<FeePayment[]>([]);

  // Auto-focus search input on mount
  useEffect(() => {
    searchInputRef.current?.focus();
    loadCollegeSettings();
    loadCashierHistory();
  }, []);

  const loadCollegeSettings = async () => {
    try {
      const res = await apiRequest<{ success: boolean; settings: CollegeSettings }>('/college/settings');
      if (res.success) setCollegeSettings(res.settings);
    } catch {
      // fallback
    }
  };

  const loadCashierHistory = async () => {
    try {
      const res = await apiRequest<{ success: boolean; payments: FeePayment[] }>('/payments/history', {
        params: { limit: 10 },
      });
      if (res.success) setRecentPayments(res.payments);
    } catch {
      // fallback
    }
  };

  // Student Lookup
  const handleStudentLookup = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const roll = rollNumberInput.trim();
    if (!roll) return;

    setIsSearching(true);
    setMessage(null);
    try {
      const res = await apiRequest<{ success: boolean; student: Student; unpaidInvoices: FeeInvoice[] }>(
        `/students/lookup/${encodeURIComponent(roll)}`
      );

      if (res.success && res.student) {
        setStudent(res.student);
        setUnpaidInvoices(res.unpaidInvoices);

        if (res.unpaidInvoices.length > 0) {
          const firstInv = res.unpaidInvoices[0];
          setSelectedInvoice(firstInv);
          setPaymentAmount(firstInv.remaining_invoice_balance);
        } else {
          setSelectedInvoice(null);
          setPaymentAmount(0);
        }
      }
    } catch (err: any) {
      setStudent(null);
      setUnpaidInvoices([]);
      setSelectedInvoice(null);
      setMessage({
        type: 'error',
        text: err.message || `Student with roll number '${roll}' not found.`,
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectInvoice = (inv: FeeInvoice) => {
    setSelectedInvoice(inv);
    setPaymentAmount(inv.remaining_invoice_balance);
  };

  // Confirm Payment & Print Receipt
  const handleConfirmPayment = async () => {
    if (!selectedInvoice) {
      setMessage({ type: 'error', text: 'Please select an unpaid challan to process payment.' });
      return;
    }

    if (paymentAmount <= 0) {
      setMessage({ type: 'error', text: 'Payment amount must be greater than zero.' });
      return;
    }

    if (paymentAmount > selectedInvoice.remaining_invoice_balance) {
      setMessage({
        type: 'error',
        text: `Payment amount of Rs. ${paymentAmount.toLocaleString()} exceeds invoice balance of Rs. ${selectedInvoice.remaining_invoice_balance.toLocaleString()}.`,
      });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      const idempotencyKey = `PAY-${selectedInvoice.id}-${paymentAmount}-${Date.now()}`;

      const res = await apiRequest<{ success: boolean; receipt: any }>('/payments/collect', {
        method: 'POST',
        body: JSON.stringify({
          invoice_id: selectedInvoice.id,
          amount: paymentAmount,
          payment_method: paymentMethod,
          reference_no: referenceNo,
          notes: paymentNotes,
          idempotency_key: idempotencyKey,
        }),
      });

      if (res.success && res.receipt) {
        setMessage({
          type: 'success',
          text: `Payment of Rs. ${paymentAmount.toLocaleString()} recorded successfully! Receipt #${res.receipt.receipt_no}`,
        });

        // Trigger Receipt PDF Generation & Download
        const pdf = generateReceiptPDF({
          ...res.receipt,
          college: collegeSettings || undefined,
        });
        pdf.save(`Receipt_${res.receipt.receipt_no}.pdf`);

        // Refresh cashier history and student details
        loadCashierHistory();
        handleStudentLookup();

        // Clear payment fields
        setReferenceNo('');
        setPaymentNotes('');
        searchInputRef.current?.focus();
      }
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err.message || 'Payment processing failed. Please verify with supervisor.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReprintReceipt = async (receiptNo: string) => {
    try {
      const res = await apiRequest<{ success: boolean; receipt: any }>(`/payments/receipt/${receiptNo}`);
      if (res.success && res.receipt) {
        const pdf = generateReceiptPDF({
          ...res.receipt,
          college: collegeSettings || undefined,
        });
        pdf.save(`Receipt_${receiptNo}_Reprint.pdf`);
      }
    } catch (err: any) {
      alert(`Could not reprint receipt: ${err.message}`);
    }
  };

  // Live recalculations
  const remainingInvoiceAfter = selectedInvoice
    ? Math.max(0, selectedInvoice.remaining_invoice_balance - paymentAmount)
    : 0;

  const remainingPackageAfter = student
    ? Math.max(0, (student.remaining_package_balance || 0) - paymentAmount)
    : 0;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      {/* Top Bar Header */}
      <div className="p-4 bg-white border-b border-slate-200 shadow-sm flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center space-x-2">
            <Receipt className="w-5 h-5 text-indigo-600" />
            <span>High-Speed Fee Counter</span>
          </h2>
          <p className="text-xs text-slate-500">
            Rapid student lookup, verified payments & immediate receipt generation
          </p>
        </div>

        {/* Counter Info Badges */}
        <div className="flex items-center space-x-3 text-xs">
          <div className="bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-md text-slate-700 flex items-center space-x-1.5">
            <User className="w-3.5 h-3.5 text-indigo-500" />
            <span>Cashier: <strong className="font-semibold">{user?.full_name}</strong></span>
          </div>
          <div className="bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-md text-slate-700">
            Workstation: <strong className="font-mono text-indigo-600">{workstationId}</strong>
          </div>
        </div>
      </div>

      {/* Main Grid: Left Counter Form, Right History */}
      <div className="flex-1 grid grid-cols-12 gap-4 p-4 overflow-y-auto">
        {/* Left Section: 8 cols */}
        <div className="col-span-12 lg:col-span-8 space-y-4">
          {/* 1. Fast Student Search Bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <form onSubmit={handleStudentLookup} className="flex space-x-3">
              <div className="relative flex-1">
                <Search className="w-5 h-5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Enter Student Roll Number (e.g. ROLL-001) or scan barcode..."
                  value={rollNumberInput}
                  onChange={(e) => setRollNumberInput(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white font-mono tracking-wide"
                />
              </div>
              <button
                type="submit"
                disabled={isSearching || !rollNumberInput.trim()}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-medium text-xs rounded-lg shadow transition flex items-center space-x-1.5 shrink-0"
              >
                {isSearching ? 'Searching...' : 'Find Student'}
              </button>
            </form>

            {/* Notification alert */}
            {message && (
              <div
                className={`mt-3 p-3 rounded-lg text-xs flex items-center space-x-2 ${
                  message.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}
              >
                {message.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                )}
                <span>{message.text}</span>
              </div>
            )}
          </div>

          {/* 2. Student Info & Financial Package Card */}
          {student && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono bg-indigo-600 text-white px-2 py-0.5 rounded text-xs font-bold">
                      {student.roll_number}
                    </span>
                    <h3 className="font-bold text-sm tracking-tight">{student.full_name}</h3>
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Father: {student.father_name} | Phone: {student.guardian_phone}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs bg-slate-800 border border-slate-700 px-2.5 py-1 rounded-md text-indigo-300">
                    {student.class_name} ({student.session_name})
                  </span>
                </div>
              </div>

              {/* 3 Mandatory Figures Banner */}
              <div className="grid grid-cols-3 divide-x divide-slate-200 border-b border-slate-200 bg-indigo-50/40 p-3 text-center">
                <div>
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                    A. Total Academic Package
                  </span>
                  <span className="text-sm font-bold text-slate-900 font-mono">
                    Rs. {Number(student.total_package_fee).toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                    Package Paid to Date
                  </span>
                  <span className="text-sm font-bold text-emerald-600 font-mono">
                    Rs. {Number(student.package_paid_to_date || 0).toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider block">
                    B. Remaining Package Balance
                  </span>
                  <span className="text-sm font-bold text-amber-600 font-mono">
                    Rs. {Number(student.remaining_package_balance || 0).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Unpaid Challans Selector */}
              <div className="p-4">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center justify-between">
                  <span>Outstanding Unpaid Challans ({unpaidInvoices.length})</span>
                  <span className="text-[11px] font-normal text-slate-500">Select challan to collect payment</span>
                </h4>

                {unpaidInvoices.length === 0 ? (
                  <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-200 text-center text-xs text-emerald-800 font-medium flex items-center justify-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>No outstanding unpaid challans! Student fee is up to date.</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {unpaidInvoices.map((inv) => {
                      const isSelected = selectedInvoice?.id === inv.id;
                      return (
                        <div
                          key={inv.id}
                          onClick={() => handleSelectInvoice(inv)}
                          className={`p-3 rounded-lg border cursor-pointer transition flex items-center justify-between ${
                            isSelected
                              ? 'bg-indigo-50 border-indigo-400 ring-2 ring-indigo-500/20 shadow-sm'
                              : 'bg-white border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center space-x-3">
                            <input
                              type="radio"
                              name="selected_challan"
                              checked={isSelected}
                              onChange={() => handleSelectInvoice(inv)}
                              className="text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                            />
                            <div>
                              <div className="flex items-center space-x-2">
                                <span className="font-mono font-bold text-xs text-slate-900">{inv.challan_no}</span>
                                <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                                  Period: {inv.billing_period}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                Due: {inv.due_date} | Cycle Fee: Rs. {Number(inv.current_cycle_fee).toLocaleString()} | Arrears: Rs. {Number(inv.arrears_carried_forward).toLocaleString()}
                              </p>
                            </div>
                          </div>

                          <div className="text-right">
                            <span className="text-xs font-semibold text-slate-500 block">Balance Due:</span>
                            <span className="text-sm font-bold text-rose-600 font-mono">
                              Rs. {Number(inv.remaining_invoice_balance).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Payment Entry Form (Only if an invoice is selected) */}
              {selectedInvoice && (
                <div className="p-4 bg-slate-50 border-t border-slate-200">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">
                    Payment Details & Confirmation
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                    {/* Amount Input */}
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Amount to Collect (PKR) *
                      </label>
                      <input
                        type="number"
                        min="1"
                        max={selectedInvoice.remaining_invoice_balance}
                        value={paymentAmount || ''}
                        onChange={(e) => setPaymentAmount(parseInt(e.target.value, 10) || 0)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 font-mono"
                      />
                    </div>

                    {/* Payment Method */}
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Payment Method *
                      </label>
                      <select
                        value={paymentMethod}
                        onChange={(e: any) => setPaymentMethod(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-900 focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="cash">Cash Counter</option>
                        <option value="bank_transfer">Bank Deposit (HBL/BOP)</option>
                        <option value="cheque">Cheque / Pay Order</option>
                        <option value="online">Online Banking / Raast</option>
                      </select>
                    </div>

                    {/* Reference / Cheque No */}
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Ref / Cheque # (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. CHQ-98124 or Deposit Slip #"
                        value={referenceNo}
                        onChange={(e) => setReferenceNo(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500 font-mono"
                      />
                    </div>
                  </div>

                  {/* Immediate Real-time Recalculation Preview */}
                  <div className="p-2.5 bg-indigo-50/70 border border-indigo-200 rounded-lg flex items-center justify-between text-xs mb-3">
                    <div className="text-slate-600">
                      Challan Remaining After Payment: <strong className="font-mono text-slate-900">Rs. {remainingInvoiceAfter.toLocaleString()}</strong>
                    </div>
                    <div className="text-slate-600">
                      Remaining Package After Payment: <strong className="font-mono text-amber-700">Rs. {remainingPackageAfter.toLocaleString()}</strong>
                    </div>
                  </div>

                  {/* One-Action Confirm Button */}
                  <button
                    onClick={handleConfirmPayment}
                    disabled={isSubmitting || paymentAmount <= 0}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-bold text-sm rounded-lg shadow-md transition flex items-center justify-center space-x-2"
                  >
                    <Printer className="w-4 h-4" />
                    <span>
                      {isSubmitting
                        ? 'Processing Payment...'
                        : `Confirm Payment (Rs. ${paymentAmount.toLocaleString()}) & Print Receipt`}
                    </span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Section: Recent Cashier History (4 cols) */}
        <div className="col-span-12 lg:col-span-4 space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 h-full flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center space-x-1.5">
                <Clock className="w-4 h-4 text-indigo-500" />
                <span>Recent Cashier Transactions</span>
              </h3>
              <button
                onClick={loadCashierHistory}
                title="Refresh History"
                className="p-1 text-slate-400 hover:text-slate-600 rounded transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 mt-3">
              {recentPayments.length === 0 ? (
                <p className="text-center text-xs text-slate-400 py-6">No transactions recorded yet today.</p>
              ) : (
                recentPayments.map((p) => (
                  <div
                    key={p.id}
                    className="p-2.5 rounded-lg border border-slate-100 bg-slate-50 hover:bg-slate-100/80 transition flex items-center justify-between text-xs"
                  >
                    <div className="overflow-hidden pr-2">
                      <div className="flex items-center space-x-1.5">
                        <span className="font-mono font-bold text-slate-900">{p.receipt_no}</span>
                        <span className="text-[10px] text-slate-400 font-mono capitalize">({p.payment_method})</span>
                      </div>
                      <p className="text-[11px] text-slate-600 truncate mt-0.5">
                        {p.full_name || p.student_name} ({p.roll_number})
                      </p>
                    </div>

                    <div className="text-right shrink-0 flex items-center space-x-2">
                      <span className="font-bold text-emerald-700 font-mono">
                        Rs. {Number(p.amount).toLocaleString()}
                      </span>
                      <button
                        onClick={() => handleReprintReceipt(p.receipt_no)}
                        title="Reprint Receipt"
                        className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-white rounded border border-transparent hover:border-slate-300 transition"
                      >
                        <Printer className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
