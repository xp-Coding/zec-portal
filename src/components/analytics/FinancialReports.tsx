import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../lib/apiClient';
import { AnalyticsMetrics, DefaulterRecord, CollegeClass } from '../../types';
import {
  BarChart3,
  TrendingUp,
  AlertOctagon,
  CreditCard,
  DollarSign,
  Download,
  Filter,
  Phone,
} from 'lucide-react';

export const FinancialReports: React.FC = () => {
  const [metrics, setMetrics] = useState<AnalyticsMetrics | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [defaulters, setDefaulters] = useState<DefaulterRecord[]>([]);
  const [classes, setClasses] = useState<CollegeClass[]>([]);
  const [activeTab, setActiveTab] = useState<'analytics' | 'defaulters'>('analytics');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Filters for defaulters
  const [classFilter, setClassFilter] = useState<string>('');
  const [minOverdueDays, setMinOverdueDays] = useState<string>('0');

  useEffect(() => {
    loadAnalytics();
    loadClasses();
  }, []);

  useEffect(() => {
    if (activeTab === 'defaulters') {
      loadDefaulters();
    }
  }, [activeTab, classFilter, minOverdueDays]);

  const loadClasses = async () => {
    try {
      const res = await apiRequest<{ success: boolean; classes: CollegeClass[] }>('/college/classes');
      if (res.success) setClasses(res.classes);
    } catch {
      // fallback
    }
  };

  const loadAnalytics = async () => {
    setIsLoading(true);
    try {
      const res = await apiRequest<{
        success: boolean;
        metrics: AnalyticsMetrics;
        payment_methods: any[];
      }>('/reports/analytics');
      if (res.success) {
        setMetrics(res.metrics);
        setPaymentMethods(res.payment_methods);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadDefaulters = async () => {
    setIsLoading(true);
    try {
      const res = await apiRequest<{ success: boolean; defaulters: DefaulterRecord[] }>('/reports/defaulters', {
        params: { class_id: classFilter, min_days: minOverdueDays },
      });
      if (res.success) {
        setDefaulters(res.defaulters);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const exportDefaultersCSV = () => {
    if (defaulters.length === 0) return;
    const headers = [
      'Roll Number',
      'Student Name',
      'Father Name',
      'Guardian Phone',
      'Class',
      'Overdue Days',
      'Total Overdue (PKR)',
      'Total Outstanding Arrears (PKR)',
      'Remaining Package Balance (PKR)',
    ];

    const rows = defaulters.map((d) => [
      `"${d.roll_number}"`,
      `"${d.student_name}"`,
      `"${d.father_name}"`,
      `"${d.guardian_phone}"`,
      `"${d.class_name}"`,
      d.days_overdue,
      d.total_overdue_amount,
      d.total_outstanding_balance,
      d.remaining_package_balance,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `ZEC_Fee_Defaulters_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      {/* Top Header */}
      <div className="p-4 bg-white border-b border-slate-200 shadow-sm flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center space-x-2">
            <BarChart3 className="w-5 h-5 text-indigo-600" />
            <span>Financial Analytics & Defaulters Control</span>
          </h2>
          <p className="text-xs text-slate-500">
            Realization rates, revenue aggregates, package commitments & overdue aging reports
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
          <button
            onClick={() => setActiveTab('analytics')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
              activeTab === 'analytics'
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Executive Dashboard
          </button>
          <button
            onClick={() => setActiveTab('defaulters')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
              activeTab === 'defaulters'
                ? 'bg-white text-rose-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Fee Defaulters Table
          </button>
        </div>
      </div>

      {/* Main View Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === 'analytics' && metrics && (
          <>
            {/* KPI Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* 1. Total Collected */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between text-slate-500 mb-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider">Total Revenue Collected</span>
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="text-xl font-bold font-mono text-emerald-700">
                  Rs. {metrics.total_collected.toLocaleString()}
                </div>
                <div className="text-[11px] text-slate-500 mt-1 flex items-center space-x-1">
                  <span>Realization Rate:</span>
                  <strong className="text-indigo-600 font-bold">{metrics.realization_rate_pct}%</strong>
                </div>
              </div>

              {/* 2. Total Invoices Billed */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between text-slate-500 mb-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider">Total Fees Billed</span>
                  <CreditCard className="w-4 h-4 text-indigo-600" />
                </div>
                <div className="text-xl font-bold font-mono text-slate-900">
                  Rs. {metrics.total_billed.toLocaleString()}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Paid Invoices: <strong>{metrics.paid_invoices_count}</strong> | Unpaid: <strong>{metrics.unpaid_invoices_count}</strong>
                </div>
              </div>

              {/* 3. Outstanding Invoices */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between text-slate-500 mb-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider">Current Outstanding</span>
                  <AlertOctagon className="w-4 h-4 text-amber-600" />
                </div>
                <div className="text-xl font-bold font-mono text-amber-700">
                  Rs. {metrics.total_outstanding_invoices.toLocaleString()}
                </div>
                <div className="text-[11px] text-rose-600 mt-1 font-semibold">
                  Overdue Amount: Rs. {metrics.overdue_amount.toLocaleString()}
                </div>
              </div>

              {/* 4. Total Package Commitments */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between text-slate-500 mb-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider">Remaining Package Balance</span>
                  <TrendingUp className="w-4 h-4 text-slate-700" />
                </div>
                <div className="text-xl font-bold font-mono text-slate-900">
                  Rs. {metrics.remaining_package_commitments.toLocaleString()}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Cumulative Commitments: Rs. {metrics.total_package_commitments.toLocaleString()}
                </div>
              </div>
            </div>

            {/* Payment Methods Breakdown & Overdue Metrics */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Payment Methods Card */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="font-bold text-xs text-slate-900 uppercase tracking-wider mb-3">
                  Collections by Payment Method
                </h3>
                <div className="space-y-2.5">
                  {paymentMethods.length === 0 ? (
                    <p className="text-xs text-slate-400 py-4 text-center">No payment transactions yet.</p>
                  ) : (
                    paymentMethods.map((m) => (
                      <div key={m.payment_method} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg text-xs">
                        <div className="flex items-center space-x-2">
                          <span className="capitalize font-bold text-slate-800">{m.payment_method.replace('_', ' ')}</span>
                          <span className="text-[10px] text-slate-400 font-mono">({m.count} payments)</span>
                        </div>
                        <span className="font-mono font-bold text-emerald-700">
                          Rs. {Number(m.total_amount).toLocaleString()}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Active Students & Invoicing Health */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                <h3 className="font-bold text-xs text-slate-900 uppercase tracking-wider mb-3">
                  Institutional Invoicing Health
                </h3>
                <div className="space-y-3 text-xs">
                  <div className="flex justify-between p-2 bg-indigo-50/50 rounded-lg">
                    <span className="text-slate-600">Active Enrolled Students:</span>
                    <strong className="font-mono text-slate-900">{metrics.active_students} students</strong>
                  </div>
                  <div className="flex justify-between p-2 bg-amber-50/50 rounded-lg">
                    <span className="text-slate-600">Partially Paid Invoices:</span>
                    <strong className="font-mono text-amber-700">{metrics.partially_paid_invoices_count} invoices</strong>
                  </div>
                  <div className="flex justify-between p-2 bg-rose-50/50 rounded-lg">
                    <span className="text-slate-600">Overdue Unpaid Invoices:</span>
                    <strong className="font-mono text-rose-700">{metrics.overdue_invoices_count} overdue</strong>
                  </div>
                </div>
                <div className="mt-4 p-3 bg-slate-900 text-white rounded-lg text-xs flex items-center justify-between">
                  <span>Zakariya Educational Complex Fee Realization:</span>
                  <span className="text-emerald-400 font-mono font-bold text-sm">{metrics.realization_rate_pct}%</span>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Defaulters Table Tab */}
        {activeTab === 'defaulters' && (
          <div className="space-y-4">
            {/* Filters Bar */}
            <div className="bg-white p-3 rounded-xl border border-slate-200 flex flex-wrap gap-3 items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-2 text-xs">
                  <Filter className="w-3.5 h-3.5 text-slate-500" />
                  <span className="font-semibold text-slate-700">Filter Class:</span>
                </div>
                <select
                  value={classFilter}
                  onChange={(e) => setClassFilter(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                >
                  <option value="">All Classes</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>

                <div className="flex items-center space-x-2 text-xs pl-2">
                  <span className="font-semibold text-slate-700">Min Overdue Days:</span>
                  <select
                    value={minOverdueDays}
                    onChange={(e) => setMinOverdueDays(e.target.value)}
                    className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                  >
                    <option value="0">All Overdue (1+ days)</option>
                    <option value="15">15+ Days Overdue</option>
                    <option value="30">30+ Days Overdue</option>
                    <option value="60">60+ Days Overdue</option>
                  </select>
                </div>
              </div>

              <button
                onClick={exportDefaultersCSV}
                disabled={defaulters.length === 0}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-300 text-white font-semibold text-xs rounded-lg shadow-sm transition flex items-center space-x-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Defaulters CSV</span>
              </button>
            </div>

            {/* Defaulters Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-rose-950 text-white font-semibold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="p-3">Roll #</th>
                    <th className="p-3">Student Name</th>
                    <th className="p-3">Guardian Phone</th>
                    <th className="p-3">Class</th>
                    <th className="p-3 text-center">Overdue Days</th>
                    <th className="p-3 text-right">Overdue Amount</th>
                    <th className="p-3 text-right">Total Arrears</th>
                    <th className="p-3 text-right">Remaining Package</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {isLoading ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-400">
                        Loading defaulters data...
                      </td>
                    </tr>
                  ) : defaulters.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-emerald-600 font-semibold">
                        No fee defaulters found for the selected criteria! All fees are current.
                      </td>
                    </tr>
                  ) : (
                    defaulters.map((d) => (
                      <tr key={d.student_id} className="hover:bg-rose-50/40 transition">
                        <td className="p-3 font-mono font-bold text-slate-900">{d.roll_number}</td>
                        <td className="p-3">
                          <div className="font-bold text-slate-900">{d.student_name}</div>
                          <div className="text-[11px] text-slate-500">Father: {d.father_name}</div>
                        </td>
                        <td className="p-3 font-mono text-slate-700">
                          <div className="flex items-center space-x-1">
                            <Phone className="w-3 h-3 text-slate-400" />
                            <span>{d.guardian_phone}</span>
                          </div>
                        </td>
                        <td className="p-3 text-slate-600">{d.class_name}</td>
                        <td className="p-3 text-center">
                          <span className="px-2 py-0.5 bg-rose-100 text-rose-800 font-bold rounded font-mono">
                            {d.days_overdue} days
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-rose-600">
                          Rs. {Number(d.total_overdue_amount).toLocaleString()}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-slate-900">
                          Rs. {Number(d.total_outstanding_balance).toLocaleString()}
                        </td>
                        <td className="p-3 text-right font-mono text-amber-700">
                          Rs. {Number(d.remaining_package_balance).toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
