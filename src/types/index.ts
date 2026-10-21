export type UserRole = 'admin' | 'fee_manager' | 'teacher';

export interface User {
  id: string;
  username: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: number;
  last_login_at?: string;
  permissions?: string[];
  workstationId?: string;
}

export interface CollegeSettings {
  id: string;
  college_name: string;
  college_short_name: string;
  logo_url?: string;
  address: string;
  phone: string;
  email: string;
  website?: string;
  bank_name: string;
  bank_branch: string;
  bank_account_title: string;
  bank_account_no: string;
  bank_iban?: string;
  payment_instructions: string;
  currency: string;
  default_due_day: number;
  late_fine_per_day: number;
  timezone: string;
  challan_copies_count: number;
}

export interface AcademicSession {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: number;
  status: 'active' | 'archived' | 'upcoming';
  created_at?: string;
}

export interface Program {
  id: string;
  name: string;
  code: string;
  description?: string;
  duration_years: number;
  status: 'active' | 'inactive';
}

export interface CollegeClass {
  id: string;
  name: string;
  program_id: string;
  academic_session_id: string;
  section: string;
  default_monthly_fee: number;
  status: 'active' | 'inactive';
  program_name?: string;
  program_code?: string;
  session_name?: string;
  student_count?: number;
  total_student_count?: number;
  created_at?: string;
}

export interface Student {
  id: string;
  roll_number: string;
  full_name: string;
  father_name: string;
  guardian_phone: string;
  address?: string;
  program_id: string;
  class_id: string;
  academic_session_id: string;
  admission_date: string;
  billing_plan: 'monthly' | 'installment';
  total_package_fee: number;
  scholarship_type: 'none' | 'percentage' | 'fixed';
  scholarship_value: number;
  status: 'active' | 'graduated' | 'suspended' | 'withdrawn' | 'struck_off';
  notes?: string;
  class_name?: string;
  program_name?: string;
  program_code?: string;
  session_name?: string;
  package_paid_to_date?: number;
  remaining_package_balance?: number;
  total_arrears_due?: number;
  standard_monthly_fee?: number;
  total_installments?: number;
}

export interface StudentFeePlan {
  id: string;
  student_id: string;
  billing_mode: 'monthly' | 'installment';
  total_package_fee: number;
  standard_monthly_fee: number;
  total_installments: number;
  installments_schedule_json?: string;
  approved_discount_type: 'none' | 'percentage' | 'fixed';
  approved_discount_value: number;
  discount_target: string;
  start_date: string;
  default_due_day: number;
  status: string;
}

export interface FeeInvoice {
  id: string;
  challan_no: string;
  student_id: string;
  academic_session_id: string;
  fee_plan_id?: string;
  billing_period: string;
  billing_mode: 'monthly' | 'installment';
  installment_no?: number;
  total_installments?: number;
  issue_date: string;
  due_date: string;
  total_package_fee: number;
  package_paid_to_date: number;
  package_balance_before: number;
  current_cycle_fee: number;
  arrears_carried_forward: number;
  late_fine: number;
  discount_amount: number;
  net_payable: number;
  amount_paid: number;
  remaining_invoice_balance: number;
  status: 'unpaid' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled';
  idempotency_key: string;
  created_by: string;
  workstation_id: string;
  created_at: string;
  roll_number?: string;
  full_name?: string;
  father_name?: string;
  class_name?: string;
  program_name?: string;
  session_name?: string;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  fee_head: string;
  description: string;
  amount: number;
  is_package_fee: number;
}

export interface FeePayment {
  id: string;
  receipt_no: string;
  invoice_id: string;
  student_id: string;
  amount: number;
  payment_method: 'cash' | 'bank_transfer' | 'cheque' | 'online' | 'pay_order';
  reference_no?: string;
  cashier_id: string;
  workstation_id: string;
  payment_date: string;
  idempotency_key: string;
  notes?: string;
  created_at: string;
  challan_no?: string;
  roll_number?: string;
  full_name?: string;
  student_name?: string;
  class_name?: string;
  cashier_name?: string;
}

export interface FeeStructure {
  id: string;
  academic_session_id: string;
  program_id?: string;
  class_id?: string;
  fee_head: string;
  fee_head_name: string;
  amount: number;
  billing_frequency: 'one_time' | 'monthly' | 'per_semester' | 'annual';
  is_optional: number;
  status: string;
  program_name?: string;
  class_name?: string;
  session_name?: string;
}

export interface FeeAdjustment {
  id: string;
  student_id: string;
  invoice_id?: string;
  adjustment_type: 'scholarship' | 'concession' | 'waiver' | 'fine' | 'reversal' | 'correction';
  amount: number;
  reason: string;
  authorized_by: string;
  authorized_by_name?: string;
  created_at: string;
}

export interface DefaulterRecord {
  student_id: string;
  roll_number: string;
  student_name: string;
  father_name: string;
  guardian_phone: string;
  class_name: string;
  program_name: string;
  total_package_fee: number;
  overdue_invoices_count: number;
  oldest_due_date: string;
  days_overdue: number;
  total_overdue_amount: number;
  total_outstanding_balance: number;
  remaining_package_balance: number;
}

export interface AnalyticsMetrics {
  active_students: number;
  total_billed: number;
  total_collected: number;
  total_outstanding_invoices: number;
  realization_rate_pct: number;
  unpaid_invoices_count: number;
  partially_paid_invoices_count: number;
  paid_invoices_count: number;
  overdue_invoices_count: number;
  overdue_amount: number;
  total_package_commitments: number;
  total_package_paid: number;
  remaining_package_commitments: number;
}

export interface Workstation {
  id: string;
  workstation_name: string;
  hardware_id: string;
  registered_by: string;
  is_active: number;
  last_active_at: string;
}

export interface AuditLog {
  id: string;
  event_type: string;
  actor_id?: string;
  actor_name: string;
  role: string;
  workstation_id: string;
  target_table: string;
  target_id: string;
  action: string;
  before_value?: string;
  after_value?: string;
  reason?: string;
  ip_address?: string;
  created_at: string;
}

export interface StaffMember {
  id: string;
  username: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: number;
  employee_id?: string;
  designation: string;
  department?: string;
  phone?: string;
  address?: string;
  joining_date?: string;
  employment_status: 'active' | 'on_leave' | 'resigned' | 'terminated';
  notes?: string;
  has_login: number;
  last_login_at?: string;
  created_at: string;
  updated_at?: string;
  assigned_classes?: Array<{
    class_id: string;
    class_name: string;
    section?: string;
    session_name?: string;
  }>;
}

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

export interface AttendanceSession {
  id: string;
  class_id: string;
  academic_session_id: string;
  attendance_date: string;
  status: 'draft' | 'submitted' | 'finalized';
  total_enrolled: number;
  present_count: number;
  absent_count: number;
  late_count: number;
  excused_count: number;
  marked_by_user_id: string;
  marked_at: string;
  finalized_by_user_id?: string;
  finalized_at?: string;
  notes?: string;
  class_name?: string;
  section?: string;
  session_name?: string;
  marked_by_name?: string;
}

export interface AttendanceRecord {
  id: string;
  student_id: string;
  attendance_date: string;
  status: AttendanceStatus;
  remarks?: string | null;
  marked_at?: string;
  marked_by_name?: string;
  correction_reason?: string;
  pre_correction_status?: string;
}

export interface AttendanceRosterItem {
  id: string;
  roll_number: string;
  full_name: string;
  father_name: string;
  guardian_phone: string;
  status: string;
  attendance?: {
    id: string;
    status: AttendanceStatus;
    remarks?: string | null;
  } | null;
}

export interface AttendanceSummary {
  total_enrolled: number;
  present_count: number;
  absent_count: number;
  late_count: number;
  excused_count: number;
  sessions_marked: number;
  total_classes: number;
  attendance_percentage: number;
}

export interface LowAttendanceStudent {
  student_id: string;
  roll_number: string;
  full_name: string;
  father_name: string;
  guardian_phone: string;
  class_name: string;
  section: string;
  program_code?: string;
  total_recorded_days: number;
  present_days: number;
  absent_days: number;
  late_days: number;
  excused_days: number;
  attendance_percentage: number;
}

