import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiRequest } from '../../lib/apiClient';
import { AnalyticsMetrics } from '../../types';
import {
  LayoutDashboard,
  Receipt,
  FileSpreadsheet,
  UserPlus,
  CalendarCheck,
  ArrowRight,
} from 'lucide-react';

interface ExecutiveDashboardProps {
  onNavigate: (view: string) => void;
}

export const ExecutiveDashboard: React.FC<ExecutiveDashboardProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState<AnalyticsMetrics | null>(null);

  useEffect(() => {
    loadMetrics();
  }, []);

  const loadMetrics = async () => {
    try {
      const res = await apiRequest<{ success: boolean; metrics: AnalyticsMetrics }>('/reports/analytics');
      if (res.success) setMetrics(res.metrics);
    } catch {
      // fallback
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      {/* Top Header */}
      <div className="p-4 bg-white border-b border-slate-200 shadow-sm flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center space-x-2">
            <LayoutDashboard className="w-5 h-5 text-indigo-600" />
            <span>Executive Dashboard</span>
          </h2>
          <p className="text-xs text-slate-500">
            Welcome back, <strong>{user?.full_name}</strong> ({user?.role.replace('_', ' ')})
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Welcome Hero Banner */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 rounded-2xl shadow-lg border border-indigo-900/40 relative overflow-hidden flex items-center justify-between">
          <div className="relative z-10 max-w-xl">
            <span className="text-[10px] font-bold tracking-widest uppercase bg-indigo-500/20 text-indigo-300 px-2.5 py-1 rounded border border-indigo-500/30">
              Welcome to ZEC Portal
            </span>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight mt-2 text-white">
              Zakariya Educational Complex
            </h1>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              Integrated college administration, automated fee calculations, one-click 3-copy challan generation, academic attendance, and institutional control.
            </p>

            <div className="flex flex-wrap gap-2.5 mt-4">
              <button
                onClick={() => onNavigate('fee_counter')}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-md transition flex items-center space-x-1.5"
              >
                <Receipt className="w-3.5 h-3.5" />
                <span>Open Fee Counter</span>
              </button>

              <button
                onClick={() => onNavigate('challans')}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-md transition flex items-center space-x-1.5"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Generate Challans</span>
              </button>

              <button
                onClick={() => onNavigate('students')}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 transition flex items-center space-x-1.5"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Student Admission</span>
              </button>
            </div>
          </div>

          <div className="hidden md:block shrink-0 pr-4">
            <img
              src="/zec_college_logo.jpg"
              alt="ZEC Crest"
              className="w-24 h-24 rounded-full object-cover shadow-2xl border-2 border-indigo-400/50 ring-4 ring-indigo-500/20"
            />
          </div>
        </div>

        {/* Quick KPI Overview */}
        {metrics && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Total Fees Collected
              </span>
              <span className="text-xl font-bold font-mono text-emerald-700">
                Rs. {metrics.total_collected.toLocaleString()}
              </span>
              <div className="text-[11px] text-slate-500 mt-1">
                Realization Rate: <strong className="text-indigo-600">{metrics.realization_rate_pct}%</strong>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Total Fees Billed
              </span>
              <span className="text-xl font-bold font-mono text-slate-900">
                Rs. {metrics.total_billed.toLocaleString()}
              </span>
              <div className="text-[11px] text-slate-500 mt-1">
                Active Enrolled: <strong>{metrics.active_students} students</strong>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Outstanding Invoices
              </span>
              <span className="text-xl font-bold font-mono text-amber-700">
                Rs. {metrics.total_outstanding_invoices.toLocaleString()}
              </span>
              <div className="text-[11px] text-rose-600 mt-1">
                Overdue: Rs. {metrics.overdue_amount.toLocaleString()}
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Remaining Package Commitments
              </span>
              <span className="text-xl font-bold font-mono text-indigo-700">
                Rs. {metrics.remaining_package_commitments.toLocaleString()}
              </span>
              <div className="text-[11px] text-slate-400 mt-1">
                Total Package: Rs. {metrics.total_package_commitments.toLocaleString()}
              </div>
            </div>
          </div>
        )}

        {/* Operational Modules Quick Links */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div
            onClick={() => onNavigate('fee_counter')}
            className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:border-indigo-400 cursor-pointer transition group"
          >
            <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3 group-hover:scale-105 transition">
              <Receipt className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-slate-900 group-hover:text-indigo-600 transition flex items-center justify-between">
              <span>Quick Fee Counter</span>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition" />
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Search by Roll Number, view package progress, collect payments, and print 80mm receipts instantly.
            </p>
          </div>

          <div
            onClick={() => onNavigate('challans')}
            className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:border-indigo-400 cursor-pointer transition group"
          >
            <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3 group-hover:scale-105 transition">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-slate-900 group-hover:text-indigo-600 transition flex items-center justify-between">
              <span>One-Click Challan Generator</span>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition" />
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Generate monthly and installment challans for the entire college or specific classes with duplicate protection.
            </p>
          </div>

          <div
            onClick={() => onNavigate('daybook')}
            className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:border-indigo-400 cursor-pointer transition group"
          >
            <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center mb-3 group-hover:scale-105 transition">
              <CalendarCheck className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-slate-900 group-hover:text-indigo-600 transition flex items-center justify-between">
              <span>Daybook & Reconciliation</span>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition" />
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              End-of-day cashier totals, cash drawer counting, shortage/surplus verification and supervisor sign-off.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
