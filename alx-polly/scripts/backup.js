// Logical backup of the app's data to local JSON files.
//
//   node scripts/backup.js [--out <dir>] [--with-users] [--include-sensitive] [--dry]
//   npm run backup -- --dry
//
// Reads polls, poll_options and votes through the Supabase REST API with the service role
// key and writes backups/<UTC timestamp>/<table>.json plus manifest.json (row counts and a
// SHA-256 per file). Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, taken from
// the environment or from .env.local.
//
// By default the votes columns voter_token and ip_address are NOT exported: voter_token is
// the hashed browser identity and ip_address is personal data. --include-sensitive adds them.
// --with-users also exports id, email and timestamps of auth users (admin API).
//
// The output directory must be git-ignored (or outside any git repository). The script refuses
// to write anywhere else, because this repository is public. Do not run it from a scheduled
// GitHub Action that uploads artifacts: that would publish user data.
//
// This is a convenience copy, not a point-in-time snapshot (tables are read one after another
// while the app keeps running). Use the Supabase plan backups for real disaster recovery.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const PAGE_SIZE = 1000;
const TABLES = ['polls', 'poll_options', 'votes'];
const SENSITIVE_COLUMNS = { votes: ['voter_token', 'ip_address'] };

/** Every table has a uuid primary key `id`, which gives a stable order for keyset pagination. */
const ORDER_COLUMN = 'id';

function parseArgs(argv) {
  const opts = { out: null, withUsers: false, includeSensitive: false, dry: false, help: false, unknown: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--with-users') opts.withUsers = true;
    else if (a === '--include-sensitive') opts.includeSensitive = true;
    else if (a === '--dry' || a === '--dry-run') opts.dry = true;
    else if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--out') {
      const v = argv[++i];
      if (!v || v.startsWith('--')) opts.unknown.push('--out requires a directory');
      else opts.out = v;
    } else if (a.startsWith('--out=')) opts.out = a.slice(6);
    else opts.unknown.push(a);
  }
  return opts;
}

/** 20261011T143005Z: sortable, no characters that are awkward in file names. */
function timestamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/** Drops the listed columns from every row. Does not mutate its input. */
function stripColumns(rows, columns) {
  if (!columns || columns.length === 0) return rows;
  return rows.map((row) => {
    const copy = { ...row };
    for (const c of columns) delete copy[c];
    return copy;
  });
}

function excludedColumns(table, includeSensitive) {
  return includeSensitive ? [] : SENSITIVE_COLUMNS[table] || [];
}

/**
 * Reads every page. `fetchPage(previousRows, pageIndex)` returns the next page of rows
 * (previousRows is [] for the first page, so a keyset fetcher can use the last row). The loop
 * stops at the first page shorter than `pageSize`. A page longer than `pageSize` is a bug in
 * the fetcher and throws, and so does a runaway loop.
 */
async function paginate(fetchPage, pageSize = PAGE_SIZE, maxPages = 100000) {
  const all = [];
  let previous = [];
  for (let page = 0; page < maxPages; page++) {
    const rows = await fetchPage(previous, page);
    if (!Array.isArray(rows)) throw new Error(`page ${page} did not return an array`);
    if (rows.length > pageSize) throw new Error(`page ${page} returned ${rows.length} rows, more than the page size ${pageSize}`);
    all.push(...rows);
    if (rows.length < pageSize) return all;
    previous = rows;
  }
  throw new Error(`gave up after ${maxPages} pages`);
}

const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');

/** Serialises rows exactly as they are written to disk, so the hash in the manifest matches the file. */
function serialise(rows) {
  return JSON.stringify(rows, null, 2) + '\n';
}

/** `files` is [{ name, rows, text }]. The manifest never contains row data. */
function buildManifest({ files, createdAt, supabaseHost, includeSensitive, withUsers, excluded }) {
  return {
    created_at: createdAt,
    source_host: supabaseHost,
    include_sensitive: !!includeSensitive,
    with_users: !!withUsers,
    excluded_columns: excluded || {},
    files: files.map((f) => ({
      file: f.name,
      rows: f.rows,
      bytes: Buffer.byteLength(f.text, 'utf8'),
      sha256: sha256(f.text),
    })),
  };
}

/**
 * True when writing under `outDir` cannot end up in a commit: either it is outside any git
 * work tree, or git reports the path as ignored. `exec(args, cwd)` returns { status, stdout }
 * and is injected so tests do not depend on the checkout.
 */
function isSafeOutDir(outDir, exec = defaultGit) {
  const abs = path.resolve(outDir);
  let existing = abs;
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) break;
    existing = parent;
  }
  const inside = exec(['rev-parse', '--is-inside-work-tree'], existing);
  // Exit 128 is git's "not a git repository": nothing to commit to, so any location is fine.
  if (inside.status === 128) return true;
  // Any other failure (git missing, odd state) or a non-work-tree such as .git itself: stay strict.
  if (inside.status !== 0 || String(inside.stdout).trim() !== 'true') return false;
  // A file path inside the directory, so a directory-only ignore pattern such as /backups/ matches.
  const probe = path.join(abs, 'manifest.json');
  const ignored = exec(['check-ignore', '-q', probe], existing);
  return ignored.status === 0;
}

function defaultGit(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout || '', error: r.error };
}

function loadEnvFile() {
  try {
    require('dotenv').config({ path: path.join(__dirname, '..', '.env.local'), quiet: true });
  } catch {
    // dotenv is a dev dependency; plain environment variables work too.
  }
}

function describePlan({ opts, outDir, host }) {
  const lines = [`Source: ${host}`, `Output: ${outDir}`];
  for (const t of TABLES) {
    const ex = excludedColumns(t, opts.includeSensitive);
    lines.push(`  ${t}.json${ex.length ? ` (without ${ex.join(', ')})` : ''}`);
  }
  if (opts.withUsers) lines.push('  users.json (id, email, created_at, last_sign_in_at, email_confirmed_at)');
  lines.push('  manifest.json (row counts and SHA-256 per file)');
  return lines.join('\n');
}

async function request(url, key, what) {
  const res = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' } });
  if (!res.ok) {
    // Never echo the response headers or the key. The body is a short PostgREST error.
    const body = (await res.text()).slice(0, 300);
    throw new Error(`${what} failed with HTTP ${res.status}: ${body}`);
  }
  return res.json();
}

function tableFetcher(base, key, table) {
  return async (previous) => {
    const after = previous.length ? previous[previous.length - 1][ORDER_COLUMN] : null;
    const qs = new URLSearchParams({ select: '*', order: `${ORDER_COLUMN}.asc`, limit: String(PAGE_SIZE) });
    if (after !== null) qs.set(ORDER_COLUMN, `gt.${after}`);
    return request(`${base}/rest/v1/${table}?${qs}`, key, `reading ${table}`);
  };
}

function usersFetcher(base, key) {
  return async (_previous, page) => {
    const body = await request(`${base}/auth/v1/admin/users?page=${page + 1}&per_page=${PAGE_SIZE}`, key, 'listing users');
    const users = Array.isArray(body) ? body : body.users || [];
    return users.map((u) => ({
      id: u.id,
      email: u.email,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
      email_confirmed_at: u.email_confirmed_at,
    }));
  };
}

async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  if (opts.help) {
    console.log('usage: node scripts/backup.js [--out <dir>] [--with-users] [--include-sensitive] [--dry]');
    return 0;
  }
  if (opts.unknown.length) {
    console.error(`unknown or invalid arguments: ${opts.unknown.join(', ')}`);
    return 2;
  }
  loadEnvFile();
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const missing = [!url && 'NEXT_PUBLIC_SUPABASE_URL', !key && 'SUPABASE_SERVICE_ROLE_KEY'].filter(Boolean);
  if (missing.length) {
    console.error(`Missing environment: ${missing.join(', ')} (set them or put them in .env.local).`);
    return 2;
  }
  let host;
  try {
    host = new URL(url).host;
  } catch {
    console.error('NEXT_PUBLIC_SUPABASE_URL is not a valid URL.');
    return 2;
  }
  const createdAt = new Date();
  const outDir = path.resolve(opts.out || path.join(__dirname, '..', 'backups', timestamp(createdAt)));

  console.log(describePlan({ opts, outDir, host }));
  if (!isSafeOutDir(outDir)) {
    console.error(`\nRefusing to write to ${outDir}: it is inside a git repository and not ignored. Use the default (backups/, which is ignored) or a directory outside the repo.`);
    return 3;
  }
  if (opts.dry) {
    console.log('\nDry run: nothing was read or written.');
    return 0;
  }
  if (fs.existsSync(outDir) && fs.readdirSync(outDir).length) {
    console.error(`\nRefusing to write into ${outDir}: it already contains files.`);
    return 3;
  }

  const files = [];
  const excluded = {};
  for (const table of TABLES) {
    const drop = excludedColumns(table, opts.includeSensitive);
    if (drop.length) excluded[table] = drop;
    const rows = stripColumns(await paginate(tableFetcher(url, key, table)), drop);
    files.push({ name: `${table}.json`, rows: rows.length, text: serialise(rows) });
    console.log(`${table}: ${rows.length} rows`);
  }
  if (opts.withUsers) {
    const rows = await paginate(usersFetcher(url, key));
    files.push({ name: 'users.json', rows: rows.length, text: serialise(rows) });
    console.log(`users: ${rows.length} rows`);
  }

  fs.mkdirSync(outDir, { recursive: true, mode: 0o700 });
  for (const f of files) fs.writeFileSync(path.join(outDir, f.name), f.text, { mode: 0o600 });
  const manifest = buildManifest({
    files,
    createdAt: createdAt.toISOString(),
    supabaseHost: host,
    includeSensitive: opts.includeSensitive,
    withUsers: opts.withUsers,
    excluded,
  });
  fs.writeFileSync(path.join(outDir, 'manifest.json'), serialise(manifest), { mode: 0o600 });
  console.log(`\nBackup written to ${outDir}`);
  return 0;
}

module.exports = { main, parseArgs, timestamp, stripColumns, excludedColumns, paginate, serialise, sha256, buildManifest, isSafeOutDir, PAGE_SIZE, TABLES };

if (require.main === module) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(`Backup failed: ${err.message}`);
      process.exit(1);
    },
  );
}
