import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Lock, User, Monitor, AlertCircle, ArrowRight } from 'lucide-react';

export const LoginView: React.FC = () => {
  const { login, workstationId } = useAuth();
  const [username, setUsername] = useState<string>('admin');
  const [password, setPassword] = useState<string>('Admin@123');
  const [customWorkstation, setCustomWorkstation] = useState<string>(workstationId);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      await login(username, password, customWorkstation);
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickLogin = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
  };

  return (
    <div className="min-h-screen w-screen flex items-center justify-center bg-slate-900 p-4 select-none relative overflow-hidden font-sans">
      {/* Background Subtle Gradient Glow */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-md w-full bg-slate-800/90 backdrop-blur-md rounded-2xl border border-slate-700/80 shadow-2xl overflow-hidden relative z-10 flex flex-col">
        {/* Top Branding Section */}
        <div className="p-6 bg-slate-950/60 border-b border-slate-700/60 text-center flex flex-col items-center">
          <img
            src="/zec_college_logo.jpg"
            alt="ZEC Logo"
            className="w-20 h-20 rounded-full object-cover shadow-xl border-2 border-indigo-400/50 ring-4 ring-indigo-500/20 mb-3"
          />
          <h1 className="text-xl font-black text-white tracking-tight">
            ZEC Portal
          </h1>
          <p className="text-xs font-semibold text-indigo-400 mt-1">
            Zakariya Educational Complex
          </p>
          <span className="text-[10px] font-medium text-slate-400 uppercase tracking-widest mt-0.5">
            College Management Desktop Software
          </span>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-950/60 border border-rose-800/80 rounded-lg text-xs text-rose-200 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Username or Staff ID
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-medium"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-medium"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Workstation Identification
            </label>
            <div className="relative">
              <Monitor className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={customWorkstation}
                onChange={(e) => setCustomWorkstation(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-900/60 border border-slate-700 rounded-lg text-xs text-indigo-300 font-mono"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-500/50 text-white font-bold text-xs rounded-lg shadow-lg shadow-indigo-600/30 transition flex items-center justify-center space-x-2 mt-2"
          >
            <span>{isLoading ? 'Authenticating...' : 'Sign In to ZEC Portal'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Quick Demo Accounts for Testing */}
        <div className="p-4 bg-slate-950/40 border-t border-slate-700/60">
          <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-2 text-center">
            Quick-Login Switcher (Authorized 3-Role System)
          </p>
          <div className="grid grid-cols-3 gap-1.5 text-[11px]">
            <button
              type="button"
              onClick={() => handleQuickLogin('admin', 'Admin@123')}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 text-left transition"
            >
              👑 <strong className="text-white block">Admin</strong>
              <span className="text-[9px] text-slate-400">Full System Access</span>
            </button>
            <button
              type="button"
              onClick={() => handleQuickLogin('feemanager', 'Manager@123')}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 text-left transition"
            >
              📊 <strong className="text-white block">Fee Manager</strong>
              <span className="text-[9px] text-slate-400">Fees & Collections</span>
            </button>
            <button
              type="button"
              onClick={() => handleQuickLogin('staff1', 'Staff@123')}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 text-left transition"
            >
              🎓 <strong className="text-white block">Teacher</strong>
              <span className="text-[9px] text-slate-400">Academic Scope</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
