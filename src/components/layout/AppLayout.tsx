import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard,
  Receipt,
  FileSpreadsheet,
  Users,
  GraduationCap,
  Layers,
  BarChart3,
  CalendarCheck,
  ShieldCheck,
  Settings,
  LogOut,
  Wifi,
  WifiOff,
  Monitor,
  UserCog,
  ClipboardCheck,
} from 'lucide-react';

interface AppLayoutProps {
  currentView: string;
  onNavigate: (view: string) => void;
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ currentView, onNavigate, children }) => {
  const { user, logout, workstationId, hasRole } = useAuth();
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, show: true },
    { id: 'attendance', label: 'Attendance', icon: ClipboardCheck, show: hasRole('admin', 'teacher') },
    { id: 'students', label: 'Students & Directory', icon: Users, show: hasRole('admin', 'fee_manager', 'teacher') },
    { id: 'academic', label: 'Classes & Sessions', icon: GraduationCap, show: hasRole('admin', 'fee_manager', 'teacher') },
    { id: 'staff', label: 'Staff Management', icon: UserCog, show: hasRole('admin') },
    { id: 'fee_counter', label: 'Fee Counter', icon: Receipt, show: hasRole('admin', 'fee_manager') },
    { id: 'challans', label: 'Challan Manager', icon: FileSpreadsheet, show: hasRole('admin', 'fee_manager') },
    { id: 'fee_structures', label: 'Fee Structures', icon: Layers, show: hasRole('admin', 'fee_manager') },
    { id: 'reports', label: 'Financial Reports', icon: BarChart3, show: hasRole('admin', 'fee_manager') },
    { id: 'daybook', label: 'Daybook & Reconcile', icon: CalendarCheck, show: hasRole('admin', 'fee_manager') },
    { id: 'audit', label: 'Audit & Diagnostics', icon: ShieldCheck, show: hasRole('admin') },
    { id: 'settings', label: 'College Settings', icon: Settings, show: hasRole('admin') },
  ];

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-100 font-sans">
      {/* Persistent Left Sidebar */}
      <aside className="w-64 bg-slate-900 text-slate-200 flex flex-col justify-between shrink-0 border-r border-slate-800 shadow-xl select-none">
        <div>
          {/* College Crest & Title */}
          <div className="p-4 border-b border-slate-800/80 bg-slate-950/40 flex items-center space-x-3">
            <img
              src="/zec_college_logo.jpg"
              alt="ZEC Logo"
              className="w-11 h-11 rounded-full object-cover shadow border border-indigo-400/40 ring-2 ring-indigo-500/20"
            />
            <div className="overflow-hidden">
              <h1 className="font-bold text-sm text-white tracking-tight leading-tight truncate">
                Zakariya Educational Complex
              </h1>
              <div className="flex items-center space-x-1.5 mt-0.5">
                <span className="text-[10px] font-semibold tracking-wider uppercase text-indigo-400 bg-indigo-950/80 px-1.5 py-0.5 rounded border border-indigo-800/60">
                  ZEC Portal
                </span>
                <span className="text-[10px] text-slate-400 font-mono">v1.0</span>
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-1 overflow-y-auto max-h-[calc(100vh-220px)]">
            {navItems
              .filter((item) => item.show)
              .map((item) => {
                const Icon = item.icon;
                const isActive = currentView === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onNavigate(item.id)}
                    className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
          </nav>
        </div>

        {/* User Card & Workstation Footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/60">
          <div className="flex items-center justify-between mb-2 px-1">
            <div className="flex items-center space-x-1.5 text-[11px] text-slate-400">
              <Monitor className="w-3.5 h-3.5 text-indigo-400" />
              <span className="font-mono text-[10px] text-slate-300">{workstationId}</span>
            </div>
            <div className="flex items-center space-x-1">
              {isOnline ? (
                <span className="flex items-center text-[10px] text-emerald-400 font-medium">
                  <Wifi className="w-3 h-3 mr-0.5" /> Online
                </span>
              ) : (
                <span className="flex items-center text-[10px] text-amber-400 font-medium">
                  <WifiOff className="w-3 h-3 mr-0.5" /> Local
                </span>
              )}
            </div>
          </div>

          <div className="bg-slate-800/80 rounded-lg p-2.5 flex items-center justify-between border border-slate-700/50">
            <div className="overflow-hidden pr-2">
              <p className="text-xs font-semibold text-white truncate">{user?.full_name}</p>
              <div className="flex items-center space-x-1 mt-0.5">
                <span className="text-[10px] capitalize px-1.5 py-0.2 bg-indigo-500/20 text-indigo-300 rounded font-mono">
                  {user?.role.replace('_', ' ')}
                </span>
              </div>
            </div>
            <button
              onClick={logout}
              title="Sign Out"
              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-700/60 rounded-md transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main View Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-50">
        {children}
      </main>
    </div>
  );
};
