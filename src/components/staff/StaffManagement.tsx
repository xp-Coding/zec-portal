import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../lib/apiClient';
import { StaffMember, CollegeClass } from '../../types';
import {
  Users,
  UserPlus,
  Search,
  Edit2,
  KeyRound,
  UserX,
  UserCheck,
  X,
  RefreshCw,
  GraduationCap,
  Phone,
  Mail,
  AlertTriangle,
  CheckCircle2,
  Lock,
} from 'lucide-react';

export const StaffManagement: React.FC = () => {
  // Staff Directory State
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [classes, setClasses] = useState<CollegeClass[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Filters
  const [search, setSearch] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [classFilter, setClassFilter] = useState<string>('all');

  // Modals
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [showEditModal, setShowEditModal] = useState<boolean>(false);
  const [showResetPasswordModal, setShowResetPasswordModal] = useState<boolean>(false);
  const [showDeactivateModal, setShowDeactivateModal] = useState<boolean>(false);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);

  // Form States (Add/Edit)
  const [fullName, setFullName] = useState<string>('');
  const [employeeId, setEmployeeId] = useState<string>('');
  const [designation, setDesignation] = useState<string>('');
  const [department, setDepartment] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [joiningDate, setJoiningDate] = useState<string>('');
  const [employmentStatus, setEmploymentStatus] = useState<'active' | 'on_leave' | 'resigned' | 'terminated'>('active');
  const [hasLogin, setHasLogin] = useState<boolean>(true);
  const [role, setRole] = useState<'admin' | 'fee_manager' | 'teacher'>('teacher');
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [assignedClassIds, setAssignedClassIds] = useState<string[]>([]);
  const [notes, setNotes] = useState<string>('');

  // Password Reset Form State
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');

  // Submission State & Feedback
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  useEffect(() => {
    loadMetadata();
    loadStaff();
  }, []);

  const loadMetadata = async () => {
    try {
      const classRes = await apiRequest<{ success: boolean; classes: CollegeClass[] }>('/college/classes');
      if (classRes.success) setClasses(classRes.classes);
    } catch (err) {
      console.error('Failed to load classes metadata:', err);
    }
  };

  const loadStaff = async () => {
    setIsLoading(true);
    try {
      const params: any = { limit: 100 };
      if (search.trim()) params.search = search.trim();
      if (roleFilter !== 'all') params.role = roleFilter;
      if (statusFilter !== 'all') params.employment_status = statusFilter;
      if (classFilter !== 'all') params.class_id = classFilter;

      const res = await apiRequest<{ success: boolean; staff: StaffMember[] }>('/staff', { params });
      if (res.success) {
        setStaff(res.staff);
      }
    } catch (err: any) {
      console.error('Failed to load staff list:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleOpenAddModal = () => {
    setFullName('');
    setEmployeeId(`EMP-${Date.now().toString().slice(-4)}`);
    setDesignation('Lecturer');
    setDepartment('Academics');
    setPhone('');
    setEmail('');
    setAddress('');
    setJoiningDate(new Date().toISOString().split('T')[0]);
    setEmploymentStatus('active');
    setHasLogin(true);
    setRole('teacher');
    setUsername('');
    setPassword('');
    setAssignedClassIds([]);
    setNotes('');
    setFormError(null);
    setShowAddModal(true);
  };

  const handleOpenEditModal = (member: StaffMember) => {
    setSelectedStaff(member);
    setFullName(member.full_name);
    setEmployeeId(member.employee_id || '');
    setDesignation(member.designation);
    setDepartment(member.department || '');
    setPhone(member.phone || '');
    setEmail(member.email);
    setAddress(member.address || '');
    setJoiningDate(member.joining_date || '');
    setEmploymentStatus(member.employment_status);
    setHasLogin(Boolean(member.has_login));
    setRole(member.role);
    setAssignedClassIds((member.assigned_classes || []).map((c) => c.class_id));
    setNotes(member.notes || '');
    setFormError(null);
    setShowEditModal(true);
  };

  const handleOpenResetPasswordModal = (member: StaffMember) => {
    setSelectedStaff(member);
    setNewPassword('');
    setConfirmPassword('');
    setFormError(null);
    setShowResetPasswordModal(true);
  };

  const handleOpenDeactivateModal = (member: StaffMember) => {
    setSelectedStaff(member);
    setShowDeactivateModal(true);
  };

  const handleToggleClassAssignment = (classId: string) => {
    setAssignedClassIds((prev) =>
      prev.includes(classId) ? prev.filter((id) => id !== classId) : [...prev, classId]
    );
  };

  // 1. Submit Add Staff
  const handleAddStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormError(null);

    try {
      if (hasLogin && (!username.trim() || !password)) {
        throw new Error('Username and password are required when login is enabled');
      }

      await apiRequest('/staff', {
        method: 'POST',
        body: JSON.stringify({
          full_name: fullName.trim(),
          employee_id: employeeId.trim() || undefined,
          designation: designation.trim(),
          department: department.trim() || undefined,
          phone: phone.trim() || undefined,
          email: email.trim().toLowerCase(),
          address: address.trim() || undefined,
          joining_date: joiningDate || undefined,
          employment_status: employmentStatus,
          role,
          has_login: hasLogin,
          username: username.trim().toLowerCase(),
          password,
          assigned_class_ids: role === 'teacher' ? assignedClassIds : [],
          notes: notes.trim() || undefined,
        }),
      });

      setShowAddModal(false);
      setFeedbackMessage(`Staff member '${fullName}' added successfully.`);
      setTimeout(() => setFeedbackMessage(null), 4000);
      loadStaff();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create staff member');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 2. Submit Edit Staff
  const handleEditStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaff) return;
    setIsSubmitting(true);
    setFormError(null);

    try {
      await apiRequest(`/staff/${selectedStaff.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          full_name: fullName.trim(),
          employee_id: employeeId.trim() || undefined,
          designation: designation.trim(),
          department: department.trim() || undefined,
          phone: phone.trim() || undefined,
          email: email.trim().toLowerCase(),
          address: address.trim() || undefined,
          joining_date: joiningDate || undefined,
          employment_status: employmentStatus,
          role,
          has_login: hasLogin,
          assigned_class_ids: role === 'teacher' ? assignedClassIds : [],
          notes: notes.trim() || undefined,
        }),
      });

      setShowEditModal(false);
      setFeedbackMessage(`Staff member '${fullName}' updated successfully.`);
      setTimeout(() => setFeedbackMessage(null), 4000);
      loadStaff();
    } catch (err: any) {
      setFormError(err.message || 'Failed to update staff member');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 3. Submit Password Reset
  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaff) return;
    if (newPassword.length < 6) {
      setFormError('New password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      await apiRequest(`/staff/${selectedStaff.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ new_password: newPassword }),
      });

      setShowResetPasswordModal(false);
      setFeedbackMessage(`Password reset successfully for ${selectedStaff.full_name}.`);
      setTimeout(() => setFeedbackMessage(null), 4000);
    } catch (err: any) {
      setFormError(err.message || 'Failed to reset password');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 4. Submit Deactivation / Reactivation
  const handleToggleStatusSubmit = async () => {
    if (!selectedStaff) return;
    setIsSubmitting(true);

    try {
      const newActive = selectedStaff.is_active === 1 ? 0 : 1;
      await apiRequest(`/staff/${selectedStaff.id}/toggle-status`, {
        method: 'POST',
        body: JSON.stringify({
          is_active: newActive,
          employment_status: newActive === 1 ? 'active' : 'on_leave',
        }),
      });

      setShowDeactivateModal(false);
      setFeedbackMessage(
        `Staff member '${selectedStaff.full_name}' was ${newActive === 1 ? 'reactivated' : 'deactivated'} successfully.`
      );
      setTimeout(() => setFeedbackMessage(null), 4000);
      loadStaff();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 font-sans">
      {/* Top Header */}
      <div className="p-4 bg-white border-b border-slate-200 shadow-sm flex items-center justify-between gap-3 shrink-0">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center space-x-2">
            <Users className="w-5 h-5 text-indigo-600" />
            <span>Staff Administration & Teacher Class Assignments</span>
          </h2>
          <p className="text-xs text-slate-500">
            Authorized administrator control of college employees, application roles, credentials and academic class scoping.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleOpenAddModal}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1.5 shadow-md shadow-indigo-600/20"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add Staff Member</span>
          </button>

          <button
            onClick={() => {
              setIsRefreshing(true);
              loadStaff();
            }}
            title="Refresh Directory"
            className="p-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-600 rounded-lg transition"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-indigo-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Feedback Alert Banner */}
      {feedbackMessage && (
        <div className="m-4 mb-0 p-3 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-lg text-xs flex items-center space-x-2 animate-fade-in shadow-sm">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-semibold">{feedbackMessage}</span>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="p-4 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center space-x-2 flex-1 max-w-md">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by name, employee ID, phone, designation..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadStaff()}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {search && (
              <button
                onClick={() => {
                  setSearch('');
                  loadStaff();
                }}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            onClick={loadStaff}
            className="px-3 py-2 bg-slate-800 text-white rounded-lg text-xs font-semibold hover:bg-slate-900 transition"
          >
            Search
          </button>
        </div>

        <div className="flex items-center space-x-2">
          {/* Role Filter */}
          <select
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
            }}
            className="px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-700 font-medium"
          >
            <option value="all">All Roles</option>
            <option value="admin">Administrator</option>
            <option value="fee_manager">Fee Manager</option>
            <option value="teacher">Teacher</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
            }}
            className="px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-700 font-medium"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="on_leave">On Leave</option>
            <option value="resigned">Resigned</option>
            <option value="terminated">Terminated</option>
          </select>

          {/* Class Filter */}
          <select
            value={classFilter}
            onChange={(e) => {
              setClassFilter(e.target.value);
            }}
            className="px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-700 font-medium max-w-xs truncate"
          >
            <option value="all">All Assigned Classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.section})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Staff Directory Table */}
      <div className="flex-1 overflow-auto p-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider text-[10px] border-b border-slate-200">
              <tr>
                <th className="p-3">Staff Profile</th>
                <th className="p-3">Employee ID</th>
                <th className="p-3">Designation & Dept</th>
                <th className="p-3">Contact</th>
                <th className="p-3">Application Role</th>
                <th className="p-3">Assigned Classes</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-600" />
                    <span>Loading staff directory...</span>
                  </td>
                </tr>
              ) : staff.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400">
                    No staff records found matching your filters.
                  </td>
                </tr>
              ) : (
                staff.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/80 transition">
                    {/* Profile */}
                    <td className="p-3">
                      <div className="font-bold text-slate-900">{m.full_name}</div>
                      <div className="text-[11px] text-slate-400 font-mono">@{m.username}</div>
                    </td>

                    {/* Employee ID */}
                    <td className="p-3 font-mono text-slate-700 font-bold">
                      {m.employee_id || '—'}
                    </td>

                    {/* Designation & Dept */}
                    <td className="p-3">
                      <div className="font-semibold text-slate-800">{m.designation}</div>
                      <div className="text-[11px] text-slate-400">{m.department || 'General'}</div>
                    </td>

                    {/* Contact */}
                    <td className="p-3 text-slate-600 space-y-0.5">
                      {m.phone && (
                        <div className="flex items-center space-x-1 text-[11px]">
                          <Phone className="w-3 h-3 text-slate-400" />
                          <span>{m.phone}</span>
                        </div>
                      )}
                      <div className="flex items-center space-x-1 text-[11px] text-slate-500">
                        <Mail className="w-3 h-3 text-slate-400" />
                        <span className="truncate max-w-[140px]">{m.email}</span>
                      </div>
                    </td>

                    {/* Role & Login */}
                    <td className="p-3">
                      <div className="flex items-center space-x-1.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            m.role === 'admin'
                              ? 'bg-purple-100 text-purple-800 border border-purple-200'
                              : m.role === 'fee_manager'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : 'bg-blue-100 text-blue-800 border border-blue-200'
                          }`}
                        >
                          {m.role.replace('_', ' ')}
                        </span>
                        {m.has_login === 1 ? (
                          <span title="Login Enabled" className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                        ) : (
                          <span title="No Login Credentials" className="inline-block w-2 h-2 rounded-full bg-slate-300" />
                        )}
                      </div>
                    </td>

                    {/* Assigned Classes */}
                    <td className="p-3">
                      {m.role === 'teacher' ? (
                        m.assigned_classes && m.assigned_classes.length > 0 ? (
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {m.assigned_classes.map((c) => (
                              <span
                                key={c.class_id}
                                className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-[10px] text-slate-700 font-medium"
                              >
                                {c.class_name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-amber-600 font-semibold text-[11px]">No classes assigned</span>
                        )
                      ) : (
                        <span className="text-slate-400 text-[11px]">All College Scope</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="p-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          m.is_active === 1 && m.employment_status === 'active'
                            ? 'bg-emerald-100 text-emerald-800'
                            : m.employment_status === 'on_leave'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {m.is_active === 1 ? m.employment_status : 'Deactivated'}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end space-x-1">
                        <button
                          onClick={() => handleOpenEditModal(m)}
                          title="Edit Profile & Classes"
                          className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-slate-100 rounded transition"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>

                        {m.has_login === 1 && (
                          <button
                            onClick={() => handleOpenResetPasswordModal(m)}
                            title="Reset Password"
                            className="p-1.5 text-slate-600 hover:text-amber-600 hover:bg-amber-50 rounded transition"
                          >
                            <KeyRound className="w-4 h-4" />
                          </button>
                        )}

                        <button
                          onClick={() => handleOpenDeactivateModal(m)}
                          title={m.is_active === 1 ? 'Deactivate Account' : 'Reactivate Account'}
                          className={`p-1.5 rounded transition ${
                            m.is_active === 1
                              ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                              : 'text-emerald-600 hover:bg-emerald-50'
                          }`}
                        >
                          {m.is_active === 1 ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: Add Staff Member */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-fade-in">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-sm text-slate-900 flex items-center space-x-2">
                <UserPlus className="w-4 h-4 text-indigo-600" />
                <span>Add New College Staff Member</span>
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddStaffSubmit} className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-300 text-rose-800 rounded-lg text-xs flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Personal Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Prof. Tariq Mahmood"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Employee ID *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. EMP-1042"
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-mono font-bold focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Designation *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Lecturer, Accountant, Principal, Lab Assistant"
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Department</label>
                  <input
                    type="text"
                    placeholder="e.g. Computer Science, Accounts, Library"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Email Address *</label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. tariq@zec.edu.pk"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Phone Number</label>
                  <input
                    type="text"
                    placeholder="e.g. 03001234567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white"
                  />
                </div>
              </div>

              {/* Login Credentials Section */}
              <div className="border-t border-slate-200 pt-3 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-800 flex items-center space-x-1.5">
                    <Lock className="w-4 h-4 text-indigo-600" />
                    <span>Application Login Credentials</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasLogin}
                      onChange={(e) => setHasLogin(e.target.checked)}
                      className="rounded text-indigo-600"
                    />
                    <span className="text-xs font-semibold text-slate-600">Enable System Login</span>
                  </label>
                </div>

                {hasLogin && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Application Role *</label>
                      <select
                        value={role}
                        onChange={(e: any) => setRole(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-bold"
                      >
                        <option value="teacher">Teacher (Academic Scope)</option>
                        <option value="fee_manager">Fee Manager (Fee Office)</option>
                        <option value="admin">Administrator (Full Control)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Login Username *</label>
                      <input
                        type="text"
                        required={hasLogin}
                        placeholder="e.g. tariq_cs"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Initial Password *</label>
                      <input
                        type="password"
                        required={hasLogin}
                        placeholder="Min 6 characters"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Teacher Class Assignment (Only when Role is Teacher) */}
              {role === 'teacher' && (
                <div className="border-t border-slate-200 pt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-slate-800 flex items-center space-x-1.5">
                      <GraduationCap className="w-4 h-4 text-blue-600" />
                      <span>Assign Teaching Classes</span>
                    </label>
                    <span className="text-[11px] text-slate-500">
                      {assignedClassIds.length} classes selected
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Teachers can only view students and mark attendance for explicitly checked classes.
                  </p>

                  <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-lg">
                    {classes.map((c) => (
                      <label
                        key={c.id}
                        className={`flex items-center space-x-2 p-2 rounded cursor-pointer transition border text-xs ${
                          assignedClassIds.includes(c.id)
                            ? 'bg-blue-50 border-blue-300 text-blue-900 font-bold'
                            : 'bg-white border-slate-200 text-slate-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={assignedClassIds.includes(c.id)}
                          onChange={() => handleToggleClassAssignment(c.id)}
                          className="rounded text-indigo-600"
                        />
                        <span className="truncate">{c.name} ({c.section})</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 rounded-lg font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold transition shadow-md shadow-indigo-600/20"
                >
                  {isSubmitting ? 'Creating...' : 'Create Staff Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Edit Staff Member */}
      {showEditModal && selectedStaff && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-fade-in">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-sm text-slate-900 flex items-center space-x-2">
                <Edit2 className="w-4 h-4 text-indigo-600" />
                <span>Edit Staff Member: {selectedStaff.full_name}</span>
              </h3>
              <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEditStaffSubmit} className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-300 text-rose-800 rounded-lg text-xs flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Employee ID</label>
                  <input
                    type="text"
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-mono font-bold focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Designation *</label>
                  <input
                    type="text"
                    required
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Department</label>
                  <input
                    type="text"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Email Address *</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Employment Status</label>
                  <select
                    value={employmentStatus}
                    onChange={(e: any) => setEmploymentStatus(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg"
                  >
                    <option value="active">Active Duty</option>
                    <option value="on_leave">On Leave</option>
                    <option value="resigned">Resigned</option>
                    <option value="terminated">Terminated</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Application Role *</label>
                  <select
                    value={role}
                    onChange={(e: any) => setRole(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-bold"
                  >
                    <option value="teacher">Teacher (Academic Scope)</option>
                    <option value="fee_manager">Fee Manager (Fee Office)</option>
                    <option value="admin">Administrator (Full Control)</option>
                  </select>
                </div>
              </div>

              {/* Teacher Class Assignment */}
              {role === 'teacher' && (
                <div className="border-t border-slate-200 pt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-slate-800 flex items-center space-x-1.5">
                      <GraduationCap className="w-4 h-4 text-blue-600" />
                      <span>Assign Teaching Classes</span>
                    </label>
                    <span className="text-[11px] text-slate-500">
                      {assignedClassIds.length} classes assigned
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-lg">
                    {classes.map((c) => (
                      <label
                        key={c.id}
                        className={`flex items-center space-x-2 p-2 rounded cursor-pointer transition border text-xs ${
                          assignedClassIds.includes(c.id)
                            ? 'bg-blue-50 border-blue-300 text-blue-900 font-bold'
                            : 'bg-white border-slate-200 text-slate-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={assignedClassIds.includes(c.id)}
                          onChange={() => handleToggleClassAssignment(c.id)}
                          className="rounded text-indigo-600"
                        />
                        <span className="truncate">{c.name} ({c.section})</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 rounded-lg font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold transition shadow-md shadow-indigo-600/20"
                >
                  {isSubmitting ? 'Saving Changes...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Reset Password */}
      {showResetPasswordModal && selectedStaff && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-fade-in">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-sm text-slate-900 flex items-center space-x-2">
                <KeyRound className="w-4 h-4 text-amber-600" />
                <span>Reset Password: {selectedStaff.full_name}</span>
              </h3>
              <button onClick={() => setShowResetPasswordModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleResetPasswordSubmit} className="p-5 space-y-4 text-xs">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-300 text-rose-800 rounded-lg text-xs flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <p className="text-slate-600 leading-relaxed">
                Enter a new secure password for <strong>{selectedStaff.full_name}</strong> (@{selectedStaff.username}).
                This will immediately update their authentication hash and be recorded in the audit log.
              </p>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">New Password *</label>
                <input
                  type="password"
                  required
                  placeholder="At least 6 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-mono focus:bg-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Confirm New Password *</label>
                <input
                  type="password"
                  required
                  placeholder="Repeat new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-mono focus:bg-white"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowResetPasswordModal(false)}
                  className="px-4 py-2 border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 rounded-lg font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold transition shadow-md shadow-amber-600/20"
                >
                  {isSubmitting ? 'Resetting...' : 'Reset Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Deactivate/Reactivate Confirmation */}
      {showDeactivateModal && selectedStaff && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-fade-in p-5 space-y-4 text-xs">
            <div className="flex items-center space-x-3 text-rose-600">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900">
                  {selectedStaff.is_active === 1 ? 'Deactivate Staff Account?' : 'Reactivate Staff Account?'}
                </h3>
                <p className="text-slate-500 text-[11px] mt-0.5">
                  Target: {selectedStaff.full_name} (@{selectedStaff.username})
                </p>
              </div>
            </div>

            <p className="text-slate-600 leading-relaxed">
              {selectedStaff.is_active === 1
                ? 'Deactivating this user will revoke their login access and prevent new attendance marking. All historical financial records, payments, attendance records, and audit logs will remain intact.'
                : 'Reactivating this user will restore their authorized access with their assigned role and class permissions.'}
            </p>

            {selectedStaff.role === 'admin' && (
              <div className="p-3 bg-amber-50 border border-amber-300 text-amber-800 rounded-lg text-[11px]">
                <strong>Warning:</strong> This account has Administrator privileges. The system strictly requires at least one active administrator at all times.
              </div>
            )}

            <div className="flex justify-end space-x-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowDeactivateModal(false)}
                className="px-4 py-2 border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 rounded-lg font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleToggleStatusSubmit}
                className={`px-5 py-2 text-white rounded-lg font-bold transition shadow-md ${
                  selectedStaff.is_active === 1
                    ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20'
                    : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                }`}
              >
                {isSubmitting
                  ? 'Processing...'
                  : selectedStaff.is_active === 1
                  ? 'Confirm Deactivation'
                  : 'Confirm Reactivation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
