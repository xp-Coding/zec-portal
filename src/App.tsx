import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginView } from './components/auth/LoginView';
import { AppLayout } from './components/layout/AppLayout';
import { ExecutiveDashboard } from './components/dashboard/ExecutiveDashboard';
import { QuickFeeCounter } from './components/fee/QuickFeeCounter';
import { ChallanManager } from './components/fee/ChallanManager';
import { StudentDirectory } from './components/students/StudentDirectory';
import { ClassesSessions } from './components/academic/ClassesSessions';
import { FeeStructures } from './components/fee/FeeStructures';
import { FinancialReports } from './components/analytics/FinancialReports';
import { CashierDaybookView } from './components/analytics/CashierDaybookView';
import { AuditLogsView } from './components/audit/AuditLogsView';
import { CollegeSettingsView } from './components/settings/CollegeSettingsView';
import { StaffManagement } from './components/staff/StaffManagement';
import { AttendanceDashboard } from './components/attendance/AttendanceDashboard';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30, // 30 seconds
      retry: 1,
    },
  },
});

const AppContent: React.FC = () => {
  const { user, isLoading } = useAuth();
  const [currentView, setCurrentView] = useState<string>('dashboard');

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-900 text-white font-sans">
        <img
          src="/zec_college_logo.jpg"
          alt="ZEC Logo"
          className="w-16 h-16 rounded-full object-cover shadow-2xl mb-4 border border-indigo-400/40 ring-4 ring-indigo-500/20 animate-pulse"
        />
        <h2 className="text-base font-bold text-white tracking-tight">ZEC Portal</h2>
        <p className="text-xs text-indigo-400 mt-1">Zakariya Educational Complex — Connecting to college database...</p>
      </div>
    );
  }

  if (!user) {
    return <LoginView />;
  }

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <ExecutiveDashboard onNavigate={setCurrentView} />;
      case 'attendance':
        return <AttendanceDashboard />;
      case 'staff':
        return <StaffManagement />;
      case 'fee_counter':
        return <QuickFeeCounter />;
      case 'challans':
        return <ChallanManager />;
      case 'students':
        return <StudentDirectory />;
      case 'academic':
        return <ClassesSessions />;
      case 'fee_structures':
        return <FeeStructures />;
      case 'reports':
        return <FinancialReports />;
      case 'daybook':
        return <CashierDaybookView />;
      case 'audit':
        return <AuditLogsView />;
      case 'settings':
        return <CollegeSettingsView />;
      default:
        return <ExecutiveDashboard onNavigate={setCurrentView} />;
    }
  };

  return (
    <AppLayout currentView={currentView} onNavigate={setCurrentView}>
      {renderView()}
    </AppLayout>
  );
};

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
