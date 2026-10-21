import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../lib/apiClient';
import { CalendarCheck, RotateCcw, CheckCircle2 } from 'lucide-react';

export const CashierDaybookView: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [daybookData, setDaybookData] = useState<any | null>(null);

  // Reconciliation Form
  const [countedCash, setCountedCash] = useState<number>(0);
  const [notes, setNotes] = useState<string>('');
  const [isReconciling, setIsReconciling] = useState<boolean>(false);
  const [reconcileSuccess, setReconcileSuccess] = useState<boolean>(false);

  useEffect(() => {
    loadDaybook();
  }, [selectedDate]);

  const loadDaybook = async () => {
    try {
      const res = await apiRequest<{ success: boolean; summary: any; methods_summary: any[]; payments: any[]; session: any }>(
        '/reports/daybook',
        { params: { date: selectedDate } }
      );
      if (res.success) {
        setDaybookData(res);
        if (res.session?.counted_cash !== undefined && res.session?.counted_cash !== null) {
          setCountedCash(res.session.counted_cash);
          setNotes(res.session.notes || '');
        } else {
          setCountedCash(res.summary.total_cash); // pre-fill with expected cash by default
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleReconcile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsReconciling(true);

    try {
      const res = await apiRequest<{ success: boolean; reconciliation: any }>('/reports/reconcile', {
        method: 'POST',
        body: JSON.stringify({
          date: selectedDate,
          counted_cash: countedCash,
          notes,
        }),
      });

      if (res.success) {
        setReconcileSuccess(true);
        setTimeout(() => setReconcileSuccess(false), 4000);
        loadDaybook();
      }
    } catch (err: any) {
      alert(`Reconciliation failed: ${err.message}`);
    } finally {
      setIsReconciling(false);
    }
  };

  const expectedCash = daybookData?.summary?.total_cash || 0;
  const cashDifference = countedCash - expectedCash;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      {/* Top Header */}
      <div className="p-4 bg-white border-b border-slate-200 shadow-sm flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center space-x-2">
            <CalendarCheck className="w-5 h-5 text-indigo-600" />
            <span>Cashier Daybook & Cash Drawer Reconciliation</span>
          </h2>
          <p className="text-xs text-slate-500">
            Daily cashier balance sheets, physical cash counting & supervisor sign-offs
          </p>
        </div>

        {reconcileSuccess && (
          <div className="px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-semibold flex items-center space-x-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Daily session reconciled and signed off!</span>
          </div>
        )}

        <div className="flex items-center space-x-2">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono"
          />
          <button
            onClick={loadDaybook}
            title="Refresh"
            className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {daybookData && (
          <>
            {/* Daily Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  Total Collections
                </span>
                <span className="text-xl font-bold font-mono text-slate-900">
                  Rs. {Number(daybookData.summary.total_collected).toLocaleString()}
                </span>
                <span className="text-[11px] text-slate-400 block mt-0.5">
                  Transactions: {daybookData.summary.transaction_count}
                </span>
              </div>

              <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200 shadow-sm">
                <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">
                  Cash In Drawer (Expected)
                </span>
                <span className="text-xl font-bold font-mono text-emerald-700">
                  Rs. {Number(daybookData.summary.total_cash).toLocaleString()}
                </span>
                <span className="text-[11px] text-emerald-600 block mt-0.5">Physical Counter Collections</span>
              </div>

              <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-200 shadow-sm">
                <span className="text-[10px] font-bold text-indigo-800 uppercase tracking-wider block">
                  Non-Cash Collections
                </span>
                <span className="text-xl font-bold font-mono text-indigo-700">
                  Rs. {Number(daybookData.summary.total_non_cash).toLocaleString()}
                </span>
                <span className="text-[11px] text-indigo-500 block mt-0.5">Bank / Online / Cheques</span>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  Reconciliation Status
                </span>
                <span className="text-lg font-bold font-mono capitalize block mt-1">
                  {daybookData.session?.status === 'reconciled' ? (
                    <span className="text-emerald-600 flex items-center space-x-1">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Reconciled</span>
                    </span>
                  ) : (
                    <span className="text-amber-600">Pending Review</span>
                  )}
                </span>
              </div>
            </div>

            {/* Reconciliation Drawer Section */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="font-bold text-xs text-slate-900 uppercase tracking-wider mb-3">
                Cash Drawer Verification & Sign-Off ({selectedDate})
              </h3>

              <form onSubmit={handleReconcile} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Actual Physical Counted Cash (PKR) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={countedCash || ''}
                    onChange={(e) => setCountedCash(parseInt(e.target.value, 10) || 0)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-bold font-mono text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Reconciliation Notes / Remarks
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Denominations checked, balanced with supervisor"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                  />
                </div>

                <div>
                  <button
                    type="submit"
                    disabled={isReconciling}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold text-xs rounded-lg shadow transition"
                  >
                    {isReconciling ? 'Saving...' : 'Sign-Off & Close Daily Session'}
                  </button>
                </div>
              </form>

              {/* Difference Status Banner */}
              <div
                className={`mt-4 p-3 rounded-lg text-xs flex items-center justify-between font-semibold ${
                  cashDifference === 0
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : cashDifference > 0
                    ? 'bg-indigo-50 text-indigo-800 border border-indigo-200'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}
              >
                <div>
                  Expected: <strong>Rs. {expectedCash.toLocaleString()}</strong> | Counted: <strong>Rs. {countedCash.toLocaleString()}</strong>
                </div>
                <div>
                  {cashDifference === 0 ? (
                    <span className="flex items-center space-x-1">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>PERFECTLY BALANCED (Rs. 0 difference)</span>
                    </span>
                  ) : cashDifference > 0 ? (
                    <span>SURPLUS IN DRAWER: +Rs. {cashDifference.toLocaleString()}</span>
                  ) : (
                    <span>SHORTAGE IN DRAWER: -Rs. {Math.abs(cashDifference).toLocaleString()}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Daily Payments List */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-3 bg-slate-900 text-white font-bold text-xs">
                Transactions Recorded on {selectedDate} ({daybookData.payments.length})
              </div>
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 text-[10px] uppercase font-bold">
                  <tr>
                    <th className="p-2.5">Receipt #</th>
                    <th className="p-2.5">Challan #</th>
                    <th className="p-2.5">Student</th>
                    <th className="p-2.5">Class</th>
                    <th className="p-2.5">Method</th>
                    <th className="p-2.5">Cashier</th>
                    <th className="p-2.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {daybookData.payments.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-slate-400">
                        No transactions recorded on this date.
                      </td>
                    </tr>
                  ) : (
                    daybookData.payments.map((p: any) => (
                      <tr key={p.id}>
                        <td className="p-2.5 font-mono font-bold text-slate-900">{p.receipt_no}</td>
                        <td className="p-2.5 font-mono text-indigo-600">{p.challan_no}</td>
                        <td className="p-2.5 font-semibold text-slate-800">{p.student_name}</td>
                        <td className="p-2.5 text-slate-500">{p.class_name}</td>
                        <td className="p-2.5 capitalize">{p.payment_method}</td>
                        <td className="p-2.5 text-slate-600">{p.cashier_name}</td>
                        <td className="p-2.5 text-right font-mono font-bold text-emerald-700">
                          Rs. {Number(p.amount).toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
