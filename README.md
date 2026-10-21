# ZEC Portal
### Unified College Management, Fee Control, Attendance & Administrative Desktop System
**Institution:** Zakariya Educational Complex (ZEC)  
**Primary Currency:** Pakistani Rupees (PKR)  
**Target Platform:** Windows 10/11 Desktop (Tauri v2 + Rust + React/TypeScript)  
**Shared Workstations:** Up to 10 synchronized Windows workstations  

---

## 🏛️ 1. System Overview

**ZEC Portal** is an administration-first college management desktop software engineered for **Zakariya Educational Complex (ZEC)**. It eliminates manual calculations, prevents duplicate invoicing, enforces strict relational financial integrity, provides attendance tracking, and allows one-click generation of professional 3-copy A4 landscape challans and thermal receipts.

### Key Capabilities

1. **One-Click Challan Generation Engine:**
   - **Scope A — Entire College:** Issues challans for all active students in the selected session with a single click.
   - **Scope B — Single Class:** Issues challans for a designated class roster.
   - **Scope C — Single Student:** Instant search by Roll Number and individual challan generation.
   - **Duplicate Prevention:** Strict database uniqueness constraints on `(student_id, billing_period, billing_mode)`. Duplicates are skipped safely without halting batches.

2. **The 3 Mandatory Figures on Every Challan:**
   - **Figure A — TOTAL ACADEMIC / PACKAGE FEE:** The agreed academic package fee commitment.
   - **Figure B — REMAINING PACKAGE FEE:** The net outstanding balance of the total package before payment.
   - **Figure C — CURRENT MONTHLY / INSTALLMENT FEE:** The fee for the active billing cycle.
   - *Plus:* Arrears carried forward, approved scholarships/concessions, late fines, net amount payable now, and projected remaining package balance.

3. **High-Speed Cashier Counter (`QuickFeeCounter.tsx`):**
   - Instant Roll Number barcode/manual lookup with automatic focus.
   - Displays student academic status, package progress, and unpaid invoices.
   - Pre-fills valid amount due and cash payment method.
   - One-action confirmation: **Confirm Payment & Print Receipt**.
   - Generates 80mm thermal receipts and A4 verifiable payment vouchers.

4. **Cashier Daybook & Cash Drawer Reconciliation:**
   - Real-time cashier collections breakdown (Cash, Bank, Online).
   - Expected physical cash vs actual counted cash calculation.
   - Identifies cash drawer surplus or shortage with supervisor sign-off.

5. **Financial Analytics & Defaulters Control:**
   - Real-time realization rates, revenue collected, total package commitments.
   - Searchable and exportable fee defaulters aging table (with overdue days filter).

6. **Enterprise Security & Immutable Audit Trail:**
   - Argon2id cryptographic password hashing.
   - Role-Based Access Control (RBAC) enforced at database and API boundary.
   - Every financial change, admission, waiver, and payment records an immutable audit log.

---

## 👥 2. User Roles & Default Test Accounts

| Role | Username | Default Password | Permissions |
|---|---|---|---|
| **Administrator** | `admin` | `Admin@123` | Full system access, college settings, academic sessions, staff accounts, bulk generation, audit trails |
| **Fee Manager** | `feemanager` | `Manager@123` | Fee structures, student fee plans, all 3 challan generation scopes, financial reports, waivers |
| **Cashier** | `cashier1` | `Cashier@123` | QuickFeeCounter, student lookup, payment collection, receipt printing, daily cash reconciliation |
| **Office Staff** | `staff1` | `Staff@123` | Student admissions, profile updates, academic roster viewer |
| **Auditor** | `auditor` | `Auditor@123` | Read-only access to financial reports, defaulters list, daybook, and audit trail |

---

## 🛠️ 3. Technology Stack

- **Desktop Framework:** Tauri v2 with Rust (Windows 10/11 native commands)
- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Lucide React, TanStack Query
- **PDF Engine:** jsPDF & jsPDF AutoTable (3-copy A4 landscape challans & 80mm thermal receipts)
- **Authoritative Database:** LibSQL / SQLite client (connects locally to `database/academia_fee.db` or remotely to Turso cloud/shared libSQL server)
- **API Server:** Node.js / Express with TypeScript, Helmet, CORS, Rate-Limiting, Argon2id & JWT

---

## 🚀 4. How to Run Locally

### Prerequisites
- Node.js 18+ (tested on Node v24)
- Rust and Cargo (for Tauri desktop shell)

### Setup & Seeding

```bash
# 1. Install dependencies
npm install
npm --prefix server install

# 2. Run Database Migrations & Seed Default Data
npm run db:seed

# 3. Start Authoritative API Server
npm run server:dev

# 4. Start Frontend Development UI (in another terminal)
npm run dev

# 5. Launch Tauri Desktop Application
npm run tauri:dev
```

---

## 🧪 5. Automated Testing

Run the full end-to-end integration test suite:

```bash
npm run test:all
```

Tests cover:
- Authentication, session expiry & password validation
- RBAC permissions enforcement
- Minimal-entry student admission and fee plan auto-generation
- Duplicate roll number rejection
- Single student & single class challan generation with the 3 mandatory figures
- Duplicate challan skipping and idempotency
- Cashier payment collection, balance updates, and receipt generation
- Financial analytics and daily cash drawer reconciliation
