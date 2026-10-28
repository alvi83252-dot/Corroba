/**
 * Creates the `proofloop` PostgreSQL database (if missing) and applies all Drizzle migrations.
 * Run: npm run db:setup --prefix apps/api
 */
import { resolve, dirname } from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import {
  buildAdminConnectionString,
  buildConnectionString,
  getDatabaseName
} from './connection.js';
import { seedDatabase } from './seed.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootEnv = resolve(__dirname, '../../../../.env');
dotenv.config({ path: rootEnv, override: true });

async function ensureDatabaseExists(): Promise<void> {
  const dbName = getDatabaseName();
  const admin = postgres(buildAdminConnectionString(), { max: 1 });

  try {
    const rows = await admin`
      SELECT 1 AS ok FROM pg_database WHERE datname = ${dbName}
    `;

    if (rows.length === 0) {
      await admin.unsafe(`CREATE DATABASE "${dbName}"`);
      console.log(`[db:setup] Created database "${dbName}"`);
    } else {
      console.log(`[db:setup] Database "${dbName}" already exists`);
    }
  } finally {
    await admin.end();
  }
}

async function runMigrations(): Promise<void> {
  const connectionString = buildConnectionString();
  const sql = postgres(connectionString, { max: 1 });
  const db = drizzle(sql);
  const migrationsFolder = resolve(__dirname, '../../drizzle');

  try {
    await migrate(db, { migrationsFolder });
    console.log('[db:setup] Migrations applied');
  } finally {
    await sql.end();
  }
}

async function repairZeroSyncSchema(): Promise<void> {
  const sql = postgres(buildConnectionString(), { max: 1 });

  try {
    const columns = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'zero_sync_records'
    `;

    if (columns.length === 0) return;

    const names = new Set(columns.map((row) => row.column_name));
    if (names.has('external_id')) return;

    console.log('[db:setup] Upgrading legacy zero_sync_records schema...');
    const migrationPath = resolve(__dirname, '../../drizzle/0001_zero_sync_schema.sql');
    const statements = readFileSync(migrationPath, 'utf8')
      .split('--> statement-breakpoint')
      .map((part) => part.trim())
      .filter(Boolean);

    for (const statement of statements) {
      await sql.unsafe(statement);
    }

    console.log('[db:setup] zero_sync_records schema upgraded');
  } finally {
    await sql.end();
  }
}

async function main() {
  console.log('[db:setup] Target:', buildConnectionString());

  await ensureDatabaseExists();
  await runMigrations();
  await repairZeroSyncSchema();
  await seedDatabase();

  console.log('[db:setup] Done — PostgreSQL is ready for ProofLoop + Zero sync audit log');
}

main().catch((err) => {
  console.error('[db:setup] Failed:', err);
  process.exit(1);
});
