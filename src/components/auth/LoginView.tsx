import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getApiBaseUrl, setApiBaseUrl, testServerConnection } from '../../lib/apiClient';
import { Lock, User, Monitor, AlertCircle, ArrowRight, Settings, Server, CheckCircle2, RefreshCw, X } from 'lucide-react';

export const LoginView: React.FC = () => {
  const { login, workstationId } = useAuth();
  const [username, setUsername] = useState<string>('admin');
  const [password, setPassword] = useState<string>('Admin@123');
  const [customWorkstation, setCustomWorkstation] = useState<string>(workstationId);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Server Connection Configuration Modal
  const [showServerModal, setShowServerModal] = useState<boolean>(false);
  const [serverUrlInput, setServerUrlInput] = useState<string>(getApiBaseUrl());
  const [testStatus, setTestStatus] = useState<{ testing: boolean; success?: boolean; message?: string } | null>(null);

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

  const handleTestConnection = async () => {
    setTestStatus({ testing: true });
    const result = await testServerConnection(serverUrlInput);
    setTestStatus({
      testing: false,
      success: result.success,
      message: result.success 
        ? `Connected (${result.latencyMs}ms) — ${result.message}`
        : `Connection Failed: ${result.message}`
    });
  };

  const handleSaveServerUrl = () => {
    if (!serverUrlInput.trim()) return;
    setApiBaseUrl(serverUrlInput);
    setShowServerModal(false);
    setError(null);
    setTestStatus(null);
  };

  return (
    <div className="min-h-screen w-screen flex items-center justify-center bg-slate-900 p-4 select-none relative overflow-hidden font-sans">
      {/* Background Subtle Gradient Glow */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-md w-full bg-slate-800/90 backdrop-blur-md rounded-2xl border border-slate-700/80 shadow-2xl overflow-hidden relative z-10 flex flex-col">
        {/* Top Branding Section */}
        <div className="p-6 bg-slate-950/60 border-b border-slate-700/60 text-center flex flex-col items-center relative">
          {/* Server Config Gear Icon */}
          <button
            type="button"
            onClick={() => {
              setServerUrlInput(getApiBaseUrl());
              setTestStatus(null);
              setShowServerModal(true);
            }}
            title="Configure Server Address"
            className="absolute top-4 right-4 text-slate-400 hover:text-white p-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-slate-700/80 transition flex items-center space-x-1.5 text-[10px]"
          >
            <Server className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline text-slate-300">Server</span>
          </button>

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
            <div className="p-3 bg-rose-950/70 border border-rose-800/80 rounded-lg text-xs text-rose-200 space-y-2">
              <div className="flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span className="leading-tight">{error}</span>
              </div>
              {error.includes('Unable to connect') && (
                <button
                  type="button"
                  onClick={() => {
                    setServerUrlInput(getApiBaseUrl());
                    setTestStatus(null);
                    setShowServerModal(true);
                  }}
                  className="w-full py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[11px] font-bold transition flex items-center justify-center space-x-1.5 shadow"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>Configure Server Connection (IP / URL)</span>
                </button>
              )}
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

      {/* Server Connection Modal */}
      {showServerModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-slate-800 rounded-xl border border-slate-700 shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-700/80 pb-3">
              <div className="flex items-center space-x-2">
                <Server className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-sm text-white">Server Connection Settings</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowServerModal(false)}
                className="text-slate-400 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Configure the API Server address that this ZEC Portal workstation connects to.
            </p>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Server Base URL
              </label>
              <input
                type="text"
                value={serverUrlInput}
                onChange={(e) => {
                  setServerUrlInput(e.target.value);
                  setTestStatus(null);
                }}
                placeholder="http://127.0.0.1:4000/api"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Quick Presets */}
            <div className="space-y-1">
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Quick Presets:</span>
              <div className="flex flex-wrap gap-2 text-[10px]">
                <button
                  type="button"
                  onClick={() => {
                    setServerUrlInput('http://127.0.0.1:4000/api');
                    setTestStatus(null);
                  }}
                  className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded font-mono transition"
                >
                  127.0.0.1:4000 (Local PC)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setServerUrlInput('http://localhost:4000/api');
                    setTestStatus(null);
                  }}
                  className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded font-mono transition"
                >
                  localhost:4000
                </button>
              </div>
            </div>

            {/* Test Status Feedback */}
            {testStatus && (
              <div
                className={`p-2.5 rounded-lg text-xs flex items-center space-x-2 border ${
                  testStatus.testing
                    ? 'bg-slate-900 border-slate-700 text-slate-300'
                    : testStatus.success
                    ? 'bg-emerald-950/60 border-emerald-800 text-emerald-200'
                    : 'bg-rose-950/60 border-rose-800 text-rose-200'
                }`}
              >
                {testStatus.testing ? (
                  <>
                    <RefreshCw className="w-4 h-4 text-indigo-400 animate-spin shrink-0" />
                    <span>Pinging server at {serverUrlInput}...</span>
                  </>
                ) : testStatus.success ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{testStatus.message}</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{testStatus.message}</span>
                  </>
                )}
              </div>
            )}

            <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-700/60 text-[11px] text-slate-400 space-y-1">
              <strong className="text-slate-300 block">💡 Connection Tips:</strong>
              <p>• If connecting to a main college server PC on LAN, use its IP (e.g. <span className="font-mono text-indigo-300">http://192.168.1.100:4000/api</span>).</p>
              <p>• If running on this PC, make sure the ZEC Portal server is running (<span className="font-mono text-indigo-300">npm run server:dev</span> or <span className="font-mono text-indigo-300">start-server.bat</span>).</p>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testStatus?.testing}
                className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold rounded-lg transition flex items-center space-x-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${testStatus?.testing ? 'animate-spin' : ''}`} />
                <span>Test Connection</span>
              </button>
              <button
                type="button"
                onClick={handleSaveServerUrl}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow transition"
              >
                Save & Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
