import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../lib/apiClient';
import { CollegeSettings, Workstation } from '../../types';
import { Settings, Save, CheckCircle2, Monitor } from 'lucide-react';

export const CollegeSettingsView: React.FC = () => {
  const [settings, setSettings] = useState<CollegeSettings | null>(null);
  const [workstations, setWorkstations] = useState<Workstation[]>([]);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  useEffect(() => {
    loadSettings();
    loadWorkstations();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await apiRequest<{ success: boolean; settings: CollegeSettings }>('/college/settings');
      if (res.success) setSettings(res.settings);
    } catch (err) {
      console.error(err);
    }
  };

  const loadWorkstations = async () => {
    try {
      const res = await apiRequest<{ success: boolean; workstations: Workstation[] }>('/college/workstations');
      if (res.success) setWorkstations(res.workstations);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setIsSaving(true);
    setSavedSuccess(false);

    try {
      const res = await apiRequest<{ success: boolean; settings: CollegeSettings }>('/college/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      });
      if (res.success) {
        setSettings(res.settings);
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 3000);
      }
    } catch (err: any) {
      alert(`Could not save settings: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (!settings) return <div className="p-8 text-center text-slate-500">Loading settings...</div>;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      <div className="p-4 bg-white border-b border-slate-200 shadow-sm flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center space-x-2">
            <Settings className="w-5 h-5 text-indigo-600" />
            <span>College Configuration & Institutional Settings</span>
          </h2>
          <p className="text-xs text-slate-500">
            Branding, bank accounts, Challan due dates, late fines & multi-workstation access
          </p>
        </div>

        {savedSuccess && (
          <div className="px-3 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-semibold flex items-center space-x-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Settings saved successfully!</span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Institutional Information */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
              <h3 className="font-bold text-xs text-slate-900 uppercase tracking-wider mb-2">
                College Identity & Contact Details
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">College Full Name *</label>
                  <input
                    type="text"
                    required
                    value={settings.college_name}
                    onChange={(e) => setSettings({ ...settings, college_name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Short Name / Abbreviation *</label>
                  <input
                    type="text"
                    required
                    value={settings.college_short_name}
                    onChange={(e) => setSettings({ ...settings, college_short_name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Campus Address *</label>
                  <input
                    type="text"
                    required
                    value={settings.address}
                    onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Contact Phone *</label>
                  <input
                    type="text"
                    required
                    value={settings.phone}
                    onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Official Email *</label>
                  <input
                    type="email"
                    required
                    value={settings.email}
                    onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Currency Symbol</label>
                  <input
                    type="text"
                    disabled
                    value={settings.currency}
                    className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold font-mono text-slate-500"
                  />
                </div>
              </div>
            </div>

            {/* Bank Collection Account */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
              <h3 className="font-bold text-xs text-slate-900 uppercase tracking-wider mb-2">
                Bank Collection Account (Printed on 3-Copy Challans)
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Bank Name *</label>
                  <input
                    type="text"
                    required
                    value={settings.bank_name}
                    onChange={(e) => setSettings({ ...settings, bank_name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Branch Name & City *</label>
                  <input
                    type="text"
                    required
                    value={settings.bank_branch}
                    onChange={(e) => setSettings({ ...settings, bank_branch: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Account Title *</label>
                  <input
                    type="text"
                    required
                    value={settings.bank_account_title}
                    onChange={(e) => setSettings({ ...settings, bank_account_title: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Account Number *</label>
                  <input
                    type="text"
                    required
                    value={settings.bank_account_no}
                    onChange={(e) => setSettings({ ...settings, bank_account_no: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-bold"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">IBAN (International Bank Account Number)</label>
                  <input
                    type="text"
                    value={settings.bank_iban || ''}
                    onChange={(e) => setSettings({ ...settings, bank_iban: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Payment Instructions Note</label>
                  <textarea
                    rows={2}
                    value={settings.payment_instructions}
                    onChange={(e) => setSettings({ ...settings, payment_instructions: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow transition flex items-center space-x-1.5"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSaving ? 'Saving Changes...' : 'Save College Settings'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Workstations */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col h-fit space-y-3">
            <h3 className="font-bold text-xs text-slate-900 uppercase tracking-wider flex items-center space-x-1.5">
              <Monitor className="w-4 h-4 text-indigo-500" />
              <span>Registered Workstations ({workstations.length}/10)</span>
            </h3>
            <p className="text-[11px] text-slate-500">
              Up to 10 authorized Windows desktop client PCs sharing synchronized ZEC college database.
            </p>

            <div className="space-y-2 mt-2">
              {workstations.map((ws) => (
                <div key={ws.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                  <div className="flex items-center justify-between">
                    <strong className="text-slate-900">{ws.workstation_name}</strong>
                    <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded text-[9px] font-bold">
                      Active
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">ID: {ws.hardware_id}</div>
                  <div className="text-[10px] text-slate-500 mt-1">Last Active: {ws.last_active_at}</div>
                </div>
              ))}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
