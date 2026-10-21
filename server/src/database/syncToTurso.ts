import { createClient } from '@libsql/client';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function sync() {
  const localDb = createClient({
    url: 'file:' + path.resolve(__dirname, '../../../../database/academia_fee.db').replace(/\\/g, '/'),
  });

  const tursoDb = createClient({
    url: process.env.DATABASE_URL!,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });

  console.log('Fetching tables from local database...');
  const tablesRes = await localDb.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'schema_migrations'");
  const tableNames = tablesRes.rows.map(r => String(r.name));

  // Determine correct dependency order
  const order = [
    'college_settings',
    'permissions',
    'roles',
    'role_permissions',
    'users',
    'workstations',
    'academic_sessions',
    'programs',
    'classes',
    'sections',
    'fee_heads',
    'fee_structures',
    'students',
    'student_fee_plans',
    'fee_invoices',
    'fee_invoice_items',
    'fee_payments',
    'fee_ledger',
    'fee_adjustments',
    'cashier_sessions',
    'cashier_transactions',
    'staff',
    'attendance',
    'audit_logs',
    'system_backups',
  ];

  const sortedTables = [
    ...order.filter(t => tableNames.includes(t)),
    ...tableNames.filter(t => !order.includes(t)),
  ];

  console.log('Tables to sync:', sortedTables);

  for (const table of sortedTables) {
    const data = await localDb.execute(`SELECT * FROM ${table}`);
    console.log(`Table ${table}: ${data.rows.length} rows`);
    if (data.rows.length === 0) continue;

    const cols = data.columns;
    const placeholders = cols.map(() => '?').join(', ');
    const colList = cols.map(c => `"${c}"`).join(', ');

    // Batch insert into Turso
    const batchSize = 50;
    for (let i = 0; i < data.rows.length; i += batchSize) {
      const chunk = data.rows.slice(i, i + batchSize);
      const statements = chunk.map(row => ({
        sql: `INSERT OR REPLACE INTO ${table} (${colList}) VALUES (${placeholders})`,
        args: cols.map(col => row[col] as any),
      }));

      await tursoDb.batch(statements, 'write');
    }
    console.log(`✅ ${table} synced successfully.`);
  }

  console.log('🎉 All local data has been synced to Turso successfully!');
}

sync().catch(err => {
  console.error('Sync failed:', err);
  process.exit(1);
});
