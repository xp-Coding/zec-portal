import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../lib/apiClient';
import { FeeStructure, AcademicSession } from '../../types';
import { Layers, Trash2 } from 'lucide-react';

export const FeeStructures: React.FC = () => {
  const [structures, setStructures] = useState<FeeStructure[]>([]);
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Form State
  const [feeHead, setFeeHead] = useState<string>('tuition');
  const [feeHeadName, setFeeHeadName] = useState<string>('Monthly Tuition Fee');
  const [amount, setAmount] = useState<number>(10000);
  const [billingFrequency, setBillingFrequency] = useState<string>('monthly');

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    if (selectedSessionId) loadStructures();
  }, [selectedSessionId]);

  const loadSessions = async () => {
    try {
      const res = await apiRequest<{ success: boolean; sessions: AcademicSession[] }>('/college/sessions');
      if (res.success && res.sessions.length > 0) {
        setSessions(res.sessions);
        const active = res.sessions.find((s) => s.is_active === 1) || res.sessions[0];
        setSelectedSessionId(active.id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadStructures = async () => {
    setIsLoading(true);
    try {
      const res = await apiRequest<{ success: boolean; structures: FeeStructure[] }>('/fees/structures', {
        params: { session_id: selectedSessionId },
      });
      if (res.success) setStructures(res.structures);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateStructure = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feeHeadName.trim() || amount < 0) return;

    try {
      await apiRequest('/fees/structures', {
        method: 'POST',
        body: JSON.stringify({
          academic_session_id: selectedSessionId,
          fee_head: feeHead,
          fee_head_name: feeHeadName.trim(),
          amount,
          billing_frequency: billingFrequency,
        }),
      });
      loadStructures();
    } catch (err: any) {
      alert(`Failed to add fee structure: ${err.message}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this fee structure?')) return;
    try {
      await apiRequest(`/fees/structures/${id}`, { method: 'DELETE' });
      loadStructures();
    } catch (err: any) {
      alert(`Could not delete structure: ${err.message}`);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      <div className="p-4 bg-white border-b border-slate-200 shadow-sm flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center space-x-2">
            <Layers className="w-5 h-5 text-indigo-600" />
            <span>Standard Fee Structures & Billing Heads</span>
          </h2>
          <p className="text-xs text-slate-500">
            Configure tuition, admission, laboratory, library and examination fee rules
          </p>
        </div>

        <div>
          <select
            value={selectedSessionId}
            onChange={(e) => setSelectedSessionId(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs"
          >
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                Session: {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Create Structure Form */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm h-fit">
          <h3 className="font-bold text-xs text-slate-900 uppercase tracking-wider mb-3">
            Add Fee Structure Head
          </h3>

          <form onSubmit={handleCreateStructure} className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">Fee Category *</label>
              <select
                value={feeHead}
                onChange={(e) => {
                  setFeeHead(e.target.value);
                  const names: Record<string, string> = {
                    tuition: 'Monthly Tuition Fee',
                    admission: 'Admission / Registration Fee',
                    exam: 'Examination Fee',
                    lab: 'Laboratory & Practical Charges',
                    library: 'Library & Learning Resource',
                    transport: 'College Transport Facility',
                    semester: 'Semester Registration',
                    other: 'Miscellaneous Approved Charges',
                  };
                  if (names[e.target.value]) setFeeHeadName(names[e.target.value]);
                }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
              >
                <option value="tuition">Tuition Fee</option>
                <option value="admission">Admission Fee</option>
                <option value="exam">Examination Fee</option>
                <option value="lab">Laboratory Fee</option>
                <option value="library">Library Fee</option>
                <option value="transport">Transport Fee</option>
                <option value="other">Other Charge</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">Display Label *</label>
              <input
                type="text"
                required
                value={feeHeadName}
                onChange={(e) => setFeeHeadName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">Standard Amount (PKR) *</label>
              <input
                type="number"
                min="0"
                required
                value={amount || ''}
                onChange={(e) => setAmount(parseInt(e.target.value, 10) || 0)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-bold"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">Billing Frequency *</label>
              <select
                value={billingFrequency}
                onChange={(e) => setBillingFrequency(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
              >
                <option value="monthly">Monthly</option>
                <option value="one_time">One-Time (On Admission)</option>
                <option value="per_semester">Per Semester</option>
                <option value="annual">Annual</option>
              </select>
            </div>

            <button
              type="submit"
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow transition"
            >
              Save Structure Head
            </button>
          </form>
        </div>

        {/* Structures List */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-3 bg-slate-900 text-white font-bold text-xs flex justify-between items-center">
            <span>Configured Fee Heads ({structures.length})</span>
            <span className="text-[10px] text-slate-400 font-mono">Currency: PKR</span>
          </div>

          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-700 text-[10px] uppercase font-bold">
              <tr>
                <th className="p-3">Fee Head</th>
                <th className="p-3">Category</th>
                <th className="p-3">Frequency</th>
                <th className="p-3 text-right">Amount (PKR)</th>
                <th className="p-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-slate-400">Loading structures...</td>
                </tr>
              ) : structures.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-slate-400">No fee structures configured for this session.</td>
                </tr>
              ) : (
                structures.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="p-3 font-bold text-slate-900">{s.fee_head_name}</td>
                    <td className="p-3 capitalize text-slate-600">{s.fee_head}</td>
                    <td className="p-3 capitalize text-slate-600">{s.billing_frequency.replace('_', ' ')}</td>
                    <td className="p-3 text-right font-mono font-bold text-indigo-700">
                      Rs. {Number(s.amount).toLocaleString()}
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => handleDelete(s.id)}
                        className="text-slate-400 hover:text-rose-600 p-1"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
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
