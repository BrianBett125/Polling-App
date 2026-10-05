import { Client, Pool } from 'pg';
import type { QueryResult } from 'pg';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { applyMigrations } = require('../../scripts/apply-migrations.js');

export const ADMIN_URL = process.env.TEST_DATABASE_URL;
export const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'supabase', 'migrations');

type Role = 'anon' | 'authenticated' | 'service_role' | 'postgres';

export type TestDb = {
  url: string;
  pool: Pool;
  /** Run one statement as a Supabase role, optionally as a signed-in user (auth.uid()). */
  as: (role: Role, uid: string | null, sql: string, params?: unknown[]) => Promise<QueryResult>;
  admin: (sql: string, params?: unknown[]) => Promise<QueryResult>;
  drop: () => Promise<void>;
};

/** Fresh database with the Supabase stub installed. Migrations are NOT applied. */
export async function createDb(): Promise<TestDb> {
  if (!ADMIN_URL) throw new Error('TEST_DATABASE_URL is not set');
  const name = `polltest_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const root = new Client({ connectionString: ADMIN_URL });
  await root.connect();
  await root.query(`CREATE DATABASE ${name}`);
  await root.end();

  const u = new URL(ADMIN_URL);
  u.pathname = `/${name}`;
  const url = u.toString();
  const pool = new Pool({ connectionString: url, max: 12 });
  await pool.query(fs.readFileSync(path.join(__dirname, 'bootstrap.sql'), 'utf8'));

  const admin = (sql: string, params?: unknown[]) => pool.query(sql, params);
  const as: TestDb['as'] = async (role, uid, sql, params) => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      if (role !== 'postgres') await c.query(`SET LOCAL ROLE ${role}`);
      await c.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [uid ?? '']);
      const res = await c.query(sql, params);
      await c.query('COMMIT');
      return res;
    } catch (e) {
      await c.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      c.release();
    }
  };
  const drop = async () => {
    await pool.end();
    const r = new Client({ connectionString: ADMIN_URL });
    await r.connect();
    await r.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await r.end();
  };
  return { url, pool, as, admin, drop };
}

export async function migrateAll(db: TestDb, dir = MIGRATIONS_DIR): Promise<string[]> {
  return applyMigrations({ connectionString: db.url, dir, log: () => {} });
}

/** A syntactically valid voter token (hex SHA-256 shape). */
export const token = (c: string) => c.repeat(64).slice(0, 64);
