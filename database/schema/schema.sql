-- AcademiaFee Pro Database Schema (SQLite / Turso / libSQL Compatible)
-- Zakariya Educational Complex (ZEC)
-- Enforces Foreign Keys, Strict Unique Constraints, Validations, and Tamper-Resistant Financial Auditing.

PRAGMA foreign_keys = ON;

-- 1. College Settings
CREATE TABLE IF NOT EXISTS college_settings (
  id TEXT PRIMARY KEY,
  college_name TEXT NOT NULL DEFAULT 'Zakariya Educational Complex',
  college_short_name TEXT NOT NULL DEFAULT 'ZEC',
  logo_url TEXT,
  address TEXT NOT NULL DEFAULT 'Main Campus, Multan Road, Pakistan',
  phone TEXT NOT NULL DEFAULT '+92-61-111-222-333',
  email TEXT NOT NULL DEFAULT 'info@zec.edu.pk',
  website TEXT NOT NULL DEFAULT 'https://zec.edu.pk',
  bank_name TEXT NOT NULL DEFAULT 'Habib Bank Limited (HBL) / Bank of Punjab (BOP)',
  bank_branch TEXT NOT NULL DEFAULT 'Cantt Branch, Multan',
  bank_account_title TEXT NOT NULL DEFAULT 'Zakariya Educational Complex Fee Collection A/C',
  bank_account_no TEXT NOT NULL DEFAULT '0142-79012345-03',
  bank_iban TEXT NOT NULL DEFAULT 'PK36HABB0001427901234503',
  payment_instructions TEXT NOT NULL DEFAULT 'Fee must be deposited in any online branch of HBL/BOP before due date. Late fine of Rs. 20/day will be levied after due date.',
  currency TEXT NOT NULL DEFAULT 'PKR',
  default_due_day INTEGER NOT NULL DEFAULT 10,
  late_fine_per_day INTEGER NOT NULL DEFAULT 20,
  timezone TEXT NOT NULL DEFAULT 'Asia/Karachi',
  challan_copies_count INTEGER NOT NULL DEFAULT 3,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Academic Sessions
CREATE TABLE IF NOT EXISTS academic_sessions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE, -- e.g. "2025-2026", "2026-2027"
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'upcoming')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON academic_sessions(is_active);

-- 3. Programs
CREATE TABLE IF NOT EXISTS programs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL, -- e.g. "FSc Pre-Medical", "ICS (Physics/Stats)", "BS Computer Science"
  code TEXT NOT NULL UNIQUE, -- e.g. "FSC-PM", "ICS", "BSCS"
  description TEXT,
  duration_years INTEGER NOT NULL DEFAULT 2,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_programs_code ON programs(code);

-- 4. Classes
CREATE TABLE IF NOT EXISTS classes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL, -- e.g. "1st Year Pre-Med A", "2nd Year ICS B"
  program_id TEXT NOT NULL REFERENCES programs(id) ON DELETE RESTRICT,
  academic_session_id TEXT NOT NULL REFERENCES academic_sessions(id) ON DELETE RESTRICT,
  section TEXT NOT NULL DEFAULT 'A',
  default_monthly_fee INTEGER NOT NULL DEFAULT 0 CHECK (default_monthly_fee >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(name, program_id, academic_session_id)
);
CREATE INDEX IF NOT EXISTS idx_classes_prog_sess ON classes(program_id, academic_session_id);

-- 5. Standard Fee Structures
CREATE TABLE IF NOT EXISTS fee_structures (
  id TEXT PRIMARY KEY,
  program_id TEXT REFERENCES programs(id) ON DELETE CASCADE,
  class_id TEXT REFERENCES classes(id) ON DELETE CASCADE,
  academic_session_id TEXT NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
  fee_head TEXT NOT NULL CHECK (fee_head IN ('admission', 'tuition', 'semester', 'exam', 'lab', 'transport', 'library', 'other')),
  fee_head_name TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount >= 0),
  billing_frequency TEXT NOT NULL CHECK (billing_frequency IN ('one_time', 'monthly', 'per_semester', 'annual')),
  is_optional INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_feestruct_class ON fee_structures(class_id, academic_session_id);

-- 6. Students
CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  roll_number TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  father_name TEXT NOT NULL,
  guardian_phone TEXT NOT NULL,
  address TEXT,
  program_id TEXT NOT NULL REFERENCES programs(id) ON DELETE RESTRICT,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
  academic_session_id TEXT NOT NULL REFERENCES academic_sessions(id) ON DELETE RESTRICT,
  admission_date TEXT NOT NULL,
  billing_plan TEXT NOT NULL CHECK (billing_plan IN ('monthly', 'installment')),
  total_package_fee INTEGER NOT NULL CHECK (total_package_fee >= 0),
  scholarship_type TEXT NOT NULL DEFAULT 'none' CHECK (scholarship_type IN ('none', 'percentage', 'fixed')),
  scholarship_value INTEGER NOT NULL DEFAULT 0 CHECK (scholarship_value >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'graduated', 'suspended', 'withdrawn', 'struck_off')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_students_roll ON students(roll_number);
CREATE INDEX IF NOT EXISTS idx_students_class ON students(class_id, status);
CREATE INDEX IF NOT EXISTS idx_students_session ON students(academic_session_id);

-- 7. Student Agreed Fee Plans
CREATE TABLE IF NOT EXISTS student_fee_plans (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL UNIQUE REFERENCES students(id) ON DELETE CASCADE,
  billing_mode TEXT NOT NULL CHECK (billing_mode IN ('monthly', 'installment')),
  total_package_fee INTEGER NOT NULL CHECK (total_package_fee >= 0),
  standard_monthly_fee INTEGER NOT NULL DEFAULT 0 CHECK (standard_monthly_fee >= 0),
  total_installments INTEGER NOT NULL DEFAULT 1 CHECK (total_installments >= 1),
  installments_schedule_json TEXT, -- JSON array of [{ installment_no, amount, due_date, label }]
  approved_discount_type TEXT NOT NULL DEFAULT 'none' CHECK (approved_discount_type IN ('none', 'percentage', 'fixed')),
  approved_discount_value INTEGER NOT NULL DEFAULT 0 CHECK (approved_discount_value >= 0),
  discount_target TEXT NOT NULL DEFAULT 'tuition' CHECK (discount_target IN ('tuition', 'package', 'all')),
  start_date TEXT NOT NULL,
  default_due_day INTEGER NOT NULL DEFAULT 10,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_feeplans_student ON student_fee_plans(student_id);

-- 8. Fee Invoices / Challans
CREATE TABLE IF NOT EXISTS fee_invoices (
  id TEXT PRIMARY KEY,
  challan_no TEXT NOT NULL UNIQUE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  academic_session_id TEXT NOT NULL REFERENCES academic_sessions(id) ON DELETE RESTRICT,
  fee_plan_id TEXT REFERENCES student_fee_plans(id) ON DELETE SET NULL,
  billing_period TEXT NOT NULL, -- e.g. "2026-03" or "INST-01"
  billing_mode TEXT NOT NULL CHECK (billing_mode IN ('monthly', 'installment')),
  installment_no INTEGER,
  total_installments INTEGER,
  issue_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  -- 3 Mandatory Financial Figures Snapshot
  total_package_fee INTEGER NOT NULL CHECK (total_package_fee >= 0),
  package_paid_to_date INTEGER NOT NULL DEFAULT 0 CHECK (package_paid_to_date >= 0),
  package_balance_before INTEGER NOT NULL DEFAULT 0 CHECK (package_balance_before >= 0),
  -- Breakdown
  current_cycle_fee INTEGER NOT NULL CHECK (current_cycle_fee >= 0),
  arrears_carried_forward INTEGER NOT NULL DEFAULT 0 CHECK (arrears_carried_forward >= 0),
  late_fine INTEGER NOT NULL DEFAULT 0 CHECK (late_fine >= 0),
  discount_amount INTEGER NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  net_payable INTEGER NOT NULL CHECK (net_payable >= 0),
  amount_paid INTEGER NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  remaining_invoice_balance INTEGER NOT NULL CHECK (remaining_invoice_balance >= 0),
  status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'partially_paid', 'paid', 'overdue', 'cancelled')),
  idempotency_key TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  workstation_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(student_id, billing_period, billing_mode)
);
CREATE INDEX IF NOT EXISTS idx_invoices_student ON fee_invoices(student_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_challan ON fee_invoices(challan_no);
CREATE INDEX IF NOT EXISTS idx_invoices_due ON fee_invoices(due_date, status);
CREATE INDEX IF NOT EXISTS idx_invoices_period ON fee_invoices(billing_period);

-- 9. Invoice Line Items
CREATE TABLE IF NOT EXISTS invoice_items (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES fee_invoices(id) ON DELETE CASCADE,
  fee_head TEXT NOT NULL,
  description TEXT NOT NULL,
  amount INTEGER NOT NULL,
  is_package_fee INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_invoice_items_inv ON invoice_items(invoice_id);

-- 10. Fee Payments
CREATE TABLE IF NOT EXISTS fee_payments (
  id TEXT PRIMARY KEY,
  receipt_no TEXT NOT NULL UNIQUE,
  invoice_id TEXT NOT NULL REFERENCES fee_invoices(id) ON DELETE RESTRICT,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  amount INTEGER NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'bank_transfer', 'cheque', 'online', 'pay_order')),
  reference_no TEXT,
  cashier_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  workstation_id TEXT NOT NULL,
  payment_date TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  sync_status TEXT NOT NULL DEFAULT 'synced' CHECK (sync_status IN ('synced', 'pending', 'conflict')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_payments_student ON fee_payments(student_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON fee_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_receipt ON fee_payments(receipt_no);
CREATE INDEX IF NOT EXISTS idx_payments_date ON fee_payments(payment_date, cashier_id);

-- 11. Payment Allocations
CREATE TABLE IF NOT EXISTS payment_allocations (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL REFERENCES fee_payments(id) ON DELETE CASCADE,
  invoice_id TEXT NOT NULL REFERENCES fee_invoices(id) ON DELETE RESTRICT,
  amount_allocated INTEGER NOT NULL CHECK (amount_allocated > 0),
  package_amount_credited INTEGER NOT NULL DEFAULT 0 CHECK (package_amount_credited >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_allocations_payment ON payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_allocations_invoice ON payment_allocations(invoice_id);

-- 12. Fee Adjustments (Waivers, Concessions, Fines)
CREATE TABLE IF NOT EXISTS fee_adjustments (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  invoice_id TEXT REFERENCES fee_invoices(id) ON DELETE SET NULL,
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('scholarship', 'concession', 'waiver', 'fine', 'reversal', 'correction')),
  amount INTEGER NOT NULL CHECK (amount != 0),
  reason TEXT NOT NULL,
  authorized_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_adjustments_student ON fee_adjustments(student_id);

-- 13. Refunds & Payment Reversals
CREATE TABLE IF NOT EXISTS refunds (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL REFERENCES fee_payments(id) ON DELETE RESTRICT,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  invoice_id TEXT NOT NULL REFERENCES fee_invoices(id) ON DELETE RESTRICT,
  amount INTEGER NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL,
  authorized_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  processed_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 14. Users
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'fee_manager', 'cashier', 'office_staff', 'auditor')),
  is_active INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- 15. Permissions
CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT
);

-- 16. Role Permissions
CREATE TABLE IF NOT EXISTS role_permissions (
  role TEXT NOT NULL,
  permission_code TEXT NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
  PRIMARY KEY(role, permission_code)
);

-- 17. Immutable Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_name TEXT NOT NULL,
  role TEXT NOT NULL,
  workstation_id TEXT NOT NULL,
  target_table TEXT NOT NULL,
  target_id TEXT NOT NULL,
  action TEXT NOT NULL,
  before_value TEXT, -- JSON
  after_value TEXT, -- JSON
  reason TEXT,
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_logs(target_table, target_id);

-- 18. Workstations (Up to 10 authorized workstations)
CREATE TABLE IF NOT EXISTS workstations (
  id TEXT PRIMARY KEY,
  workstation_name TEXT NOT NULL,
  hardware_id TEXT NOT NULL UNIQUE,
  registered_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_active_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 19. Synchronization Outbox
CREATE TABLE IF NOT EXISTS sync_outbox (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL UNIQUE,
  entity_type TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('insert', 'update', 'delete')),
  payload TEXT NOT NULL, -- JSON
  workstation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'conflict')),
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sync_status ON sync_outbox(status);

-- 20. Synchronization Conflicts
CREATE TABLE IF NOT EXISTS sync_conflicts (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  workstation_id TEXT NOT NULL,
  remote_data TEXT NOT NULL,
  local_data TEXT NOT NULL,
  conflict_reason TEXT NOT NULL,
  resolution_status TEXT NOT NULL DEFAULT 'unresolved' CHECK (resolution_status IN ('unresolved', 'resolved')),
  resolved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  resolution_notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT
);

-- 21. Cashier Sessions (End-of-day Cash Reconciliation)
CREATE TABLE IF NOT EXISTS cashier_sessions (
  id TEXT PRIMARY KEY,
  cashier_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  workstation_id TEXT NOT NULL,
  opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at TEXT,
  opening_balance INTEGER NOT NULL DEFAULT 0,
  expected_cash INTEGER NOT NULL DEFAULT 0,
  counted_cash INTEGER,
  cash_difference INTEGER,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'reconciled')),
  supervisor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_cashier_sessions ON cashier_sessions(cashier_id, status);

-- 22. Database Migrations
CREATE TABLE IF NOT EXISTS schema_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
