// Applies supabase/migrations/*.sql in filename order against a Postgres database.
//
//   SUPABASE_DB_URL=postgresql://... npm run db:migrate            apply pending
//   SUPABASE_DB_URL=postgresql://... npm run db:migrate -- --dry-run   list pending only
//
// Needs the direct Postgres connection string (Supabase dashboard > Connect), not
// the REST URL or an API key. Each file runs in its own transaction and is
// recorded in public.app_migrations, so re-running only applies new files.
// SQL is never executed through an HTTP-callable function.
try {
  require('dotenv').config({ path: '.env.local' });
} catch {
  // dotenv is a dev dependency; plain environment variables work too.
}
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const DEFAULT_DIR = path.join(__dirname, '..', 'supabase', 'migrations');
const LOCK_KEY = 727001; // arbitrary constant: serializes concurrent runners

/** Migration file names in the order they must run. */
function listMigrations(dir = DEFAULT_DIR) {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
}

async function applyMigrations({ connectionString, dir = DEFAULT_DIR, dryRun = false, log = console.log }) {
  const client = new Client({ connectionString });
  await client.connect();
  const applied = [];
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    const exists = (await client.query(`SELECT to_regclass('public.app_migrations') AS t`)).rows[0].t;
    if (!exists && !dryRun) await client.query(`
      CREATE TABLE IF NOT EXISTS public.app_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      ALTER TABLE public.app_migrations ENABLE ROW LEVEL SECURITY;
      REVOKE ALL ON public.app_migrations FROM PUBLIC;
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          EXECUTE 'REVOKE ALL ON public.app_migrations FROM anon, authenticated';
        END IF;
      END $$;
    `);
    const done = exists || !dryRun
      ? new Set((await client.query('SELECT name FROM public.app_migrations')).rows.map((r) => r.name))
      : new Set();
    const pending = listMigrations(dir).filter((f) => !done.has(f));

    if (pending.length === 0) {
      log('No pending migrations.');
      return applied;
    }
    for (const file of pending) {
      if (dryRun) {
        log(`pending: ${file}`);
        continue;
      }
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      log(`Applying ${file}`);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO public.app_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        applied.push(file);
      } catch (err) {
        await client.query('ROLLBACK');
        err.message = `Migration ${file} failed and was rolled back: ${err.message}`;
        throw err;
      }
    }
    return applied;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
    await client.end();
  }
}

module.exports = { applyMigrations, listMigrations };

if (require.main === module) {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    console.error('SUPABASE_DB_URL is required (direct Postgres connection string).');
    process.exit(1);
  }
  applyMigrations({ connectionString, dryRun: process.argv.includes('--dry-run') })
    .then((applied) => console.log(`Done. Applied ${applied.length} migration(s).`))
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
