import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../lib/apiClient';
import { AuditLog } from '../../types';
import { ShieldCheck, Server, Database, RefreshCw, Cpu, Activity } from 'lucide-react';

export const AuditLogsView: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [diagnostics, setDiagnostics] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    loadAudit();
    loadDiagnostics();
  }, []);

  const loadAudit = async () => {
    setIsLoading(true);
    try {
      const res = await apiRequest<{ success: boolean; logs: AuditLog[] }>('/audit', {
        params: { limit: 50 },
      });
      if (res.success) setLogs(res.logs);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadDiagnostics = async () => {
    try {
      const res = await apiRequest<{ success: boolean; diagnostics: any }>('/audit/diagnostics');
      if (res.success) setDiagnostics(res.diagnostics);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      <div className="p-4 bg-white border-b border-slate-200 shadow-sm flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center space-x-2">
            <ShieldCheck className="w-5 h-5 text-indigo-600" />
            <span>Immutable Audit Trail & System Diagnostics</span>
          </h2>
          <p className="text-xs text-slate-500">
            Tamper-resistant audit logs, user security actions & workstation health monitoring
          </p>
        </div>

        <button
          onClick={() => {
            loadAudit();
            loadDiagnostics();
          }}
          className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200"
          title="Refresh Logs"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* System Diagnostics Cards */}
        {diagnostics && (
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-3">
              <Database className="w-6 h-6 text-emerald-600 shrink-0" />
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Database</span>
                <span className="text-xs font-bold text-slate-900">
                  {diagnostics.database_connected ? 'Connected (LibSQL / SQLite)' : 'Disconnected'}
                </span>
              </div>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-3">
              <Server className="w-6 h-6 text-indigo-600 shrink-0" />
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Active Workstations</span>
                <span className="text-xs font-bold text-slate-900 font-mono">
                  {diagnostics.active_workstations} of 10 Registered
                </span>
              </div>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-3">
              <Cpu className="w-6 h-6 text-slate-700 shrink-0" />
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Node Environment</span>
                <span className="text-xs font-bold text-slate-900 font-mono">{diagnostics.node_version}</span>
              </div>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-3">
              <Activity className="w-6 h-6 text-indigo-600 shrink-0" />
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Uptime</span>
                <span className="text-xs font-bold text-slate-900 font-mono">
                  {Math.floor(diagnostics.uptime_seconds / 60)} minutes
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Audit Log Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-3 bg-slate-900 text-white font-bold text-xs">
            Recent Security & Administrative Audit Events ({logs.length})
          </div>

          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-700 text-[10px] uppercase font-bold">
              <tr>
                <th className="p-2.5">Timestamp</th>
                <th className="p-2.5">Event Type</th>
                <th className="p-2.5">Actor</th>
                <th className="p-2.5">Workstation</th>
                <th className="p-2.5">Action & Table</th>
                <th className="p-2.5">Reason / Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-slate-400">Loading audit trail...</td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-slate-400">No audit events recorded yet.</td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 font-mono text-[11px]">
                    <td className="p-2.5 text-slate-500">{log.created_at}</td>
                    <td className="p-2.5 font-bold text-indigo-700">{log.event_type}</td>
                    <td className="p-2.5 font-sans font-semibold text-slate-800">
                      {log.actor_name} <span className="text-[10px] text-slate-400">({log.role})</span>
                    </td>
                    <td className="p-2.5 text-slate-600">{log.workstation_id}</td>
                    <td className="p-2.5 text-slate-900">
                      <strong>{log.action}</strong> on <code>{log.target_table}</code>
                    </td>
                    <td className="p-2.5 font-sans text-slate-600 truncate max-w-xs">{log.reason || 'Normal operation'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
