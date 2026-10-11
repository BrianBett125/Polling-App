import { afterEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const backup = require('../scripts/backup.js');

const { parseArgs, timestamp, stripColumns, paginate, buildManifest, serialise, sha256, isSafeOutDir, main } = backup;

describe('parseArgs', () => {
  it('reads flags and --out in both forms', () => {
    expect(parseArgs(['--dry', '--with-users', '--include-sensitive', '--out', 'x'])).toMatchObject({
      dry: true,
      withUsers: true,
      includeSensitive: true,
      out: 'x',
      unknown: [],
    });
    expect(parseArgs(['--out=y']).out).toBe('y');
  });
  it('defaults to the safe choices', () => {
    expect(parseArgs([])).toMatchObject({ dry: false, withUsers: false, includeSensitive: false, out: null });
  });
  it('reports unknown flags and a missing --out value', () => {
    expect(parseArgs(['--nope']).unknown).toEqual(['--nope']);
    expect(parseArgs(['--out']).unknown.length).toBe(1);
    expect(parseArgs(['--out', '--dry']).unknown.length).toBe(1);
  });
});

describe('timestamp', () => {
  it('is a UTC, file-name-safe, sortable stamp', () => {
    expect(timestamp(new Date('2026-10-11T14:30:05.123Z'))).toBe('20261011T143005Z');
    expect(timestamp(new Date('2026-10-11T14:30:05Z')) < timestamp(new Date('2026-10-11T14:30:06Z'))).toBe(true);
    expect(timestamp(new Date('2026-12-31T23:59:59Z')) < timestamp(new Date('2027-01-01T00:00:00Z'))).toBe(true);
  });
});

describe('stripColumns', () => {
  const rows = [{ id: '1', voter_token: 't', ip_address: 'ip', option_id: 'o' }];
  it('removes the listed columns without mutating the input', () => {
    expect(stripColumns(rows, ['voter_token', 'ip_address'])).toEqual([{ id: '1', option_id: 'o' }]);
    expect(rows[0]).toHaveProperty('voter_token');
  });
  it('returns rows unchanged when there is nothing to strip', () => {
    expect(stripColumns(rows, [])).toBe(rows);
  });
});

describe('paginate', () => {
  const make = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String(i).padStart(5, '0') }));

  it('walks pages until a short page and passes the previous rows to the fetcher', async () => {
    const data = make(2500);
    const calls: Array<string | null> = [];
    const fetchPage = async (prev: Array<{ id: string }>) => {
      const after = prev.length ? prev[prev.length - 1].id : null;
      calls.push(after);
      const start = after === null ? 0 : data.findIndex((r) => r.id === after) + 1;
      return data.slice(start, start + 1000);
    };
    const all = await paginate(fetchPage, 1000);
    expect(all).toHaveLength(2500);
    expect(all.map((r: { id: string }) => r.id)).toEqual(data.map((r) => r.id));
    expect(calls).toEqual([null, '00999', '01999']);
  });

  it('needs one extra empty request when the total is an exact multiple of the page size', async () => {
    const data = make(2000);
    const fetchPage = vi.fn(async (_prev: unknown[], page: number) => data.slice(page * 1000, page * 1000 + 1000));
    expect(await paginate(fetchPage, 1000)).toHaveLength(2000);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it('handles an empty table with a single request', async () => {
    const fetchPage = vi.fn(async () => []);
    expect(await paginate(fetchPage, 1000)).toEqual([]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('rejects an over-long page, a non-array and a runaway loop', async () => {
    await expect(paginate(async () => make(3), 2)).rejects.toThrow(/more than the page size/);
    await expect(paginate(async () => ({}) as never, 2)).rejects.toThrow(/array/);
    await expect(paginate(async () => make(2), 2, 5)).rejects.toThrow(/gave up/);
  });

  it('propagates a fetch failure instead of returning partial data', async () => {
    let n = 0;
    const fetchPage = async () => {
      if (n++ === 1) throw new Error('HTTP 500');
      return make(2);
    };
    await expect(paginate(fetchPage, 2)).rejects.toThrow('HTTP 500');
  });
});

describe('buildManifest', () => {
  it('records row counts, byte sizes and the SHA-256 of the exact text written, and no row data', () => {
    const text = serialise([{ id: 'a', secret: 'do-not-leak' }]);
    const m = buildManifest({
      files: [{ name: 'polls.json', rows: 1, text }],
      createdAt: '2026-10-11T00:00:00.000Z',
      supabaseHost: 'x.supabase.co',
      includeSensitive: false,
      withUsers: false,
      excluded: { votes: ['voter_token', 'ip_address'] },
    });
    expect(m.files).toEqual([
      { file: 'polls.json', rows: 1, bytes: Buffer.byteLength(text), sha256: crypto.createHash('sha256').update(text).digest('hex') },
    ]);
    expect(m.excluded_columns.votes).toEqual(['voter_token', 'ip_address']);
    expect(JSON.stringify(m)).not.toContain('do-not-leak');
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('isSafeOutDir', () => {
  it('uses git: not a repo is safe, ignored is safe, tracked-and-not-ignored is refused', () => {
    const git = (status: number, stdout = '') => () => ({ status, stdout });
    expect(isSafeOutDir(os.tmpdir(), git(128))).toBe(true);
    const seq = (inside: { status: number; stdout: string }, ignored: { status: number; stdout: string }) => {
      const calls: string[][] = [];
      const exec = (args: string[]) => {
        calls.push(args);
        return args[0] === 'rev-parse' ? inside : ignored;
      };
      return { exec, calls };
    };
    const a = seq({ status: 0, stdout: 'true\n' }, { status: 0, stdout: '' });
    expect(isSafeOutDir(os.tmpdir(), a.exec)).toBe(true);
    expect(a.calls[1].slice(0, 2)).toEqual(['check-ignore', '-q']);
    const b = seq({ status: 0, stdout: 'true\n' }, { status: 1, stdout: '' });
    expect(isSafeOutDir(os.tmpdir(), b.exec)).toBe(false);
  });

  it('is strict when git is unavailable or reports something unexpected', () => {
    expect(isSafeOutDir(os.tmpdir(), () => ({ status: null, stdout: '' }))).toBe(false);
    expect(isSafeOutDir(os.tmpdir(), () => ({ status: 0, stdout: 'false\n' }))).toBe(false);
  });

  it('agrees with real git: backups/ in this app is ignored, docs/ is not', () => {
    const appRoot = path.join(__dirname, '..');
    expect(isSafeOutDir(path.join(appRoot, 'backups', '20261011T000000Z'))).toBe(true);
    expect(isSafeOutDir(path.join(appRoot, 'docs', 'x'))).toBe(false);
  });

  it('agrees with real git in a scratch repository', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-git-'));
    try {
      spawnSync('git', ['init', '-q'], { cwd: dir });
      fs.writeFileSync(path.join(dir, '.gitignore'), '/backups/\n');
      expect(isSafeOutDir(path.join(dir, 'backups', 'a'))).toBe(true);
      expect(isSafeOutDir(path.join(dir, 'other'))).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('main against a stub Supabase', () => {
  const dirs: string[] = [];
  const servers: http.Server[] = [];
  afterEach(() => {
    for (const s of servers.splice(0)) s.close();
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  const tables: Record<string, Array<Record<string, unknown>>> = {
    polls: Array.from({ length: 1200 }, (_, i) => ({ id: `p${String(i).padStart(5, '0')}`, title: `t${i}` })),
    poll_options: [{ id: 'o1', poll_id: 'p00000', text: 'a' }],
    votes: [{ id: 'v1', poll_id: 'p00000', option_id: 'o1', voter_token: 'tok', ip_address: '1.2.3.4' }],
  };
  const users = [{ id: 'u1', email: 'a@example.com', created_at: 'c', last_sign_in_at: 'l', email_confirmed_at: 'e', app_metadata: { secret: 'x' } }];

  async function start(seen: string[]) {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '', 'http://x');
      seen.push(`${req.headers.authorization} ${url.pathname}${url.search}`);
      res.setHeader('content-type', 'application/json');
      const m = url.pathname.match(/^\/rest\/v1\/(\w+)$/);
      if (m && tables[m[1]]) {
        const gt = url.searchParams.get('id')?.replace(/^gt\./, '');
        const limit = Number(url.searchParams.get('limit'));
        const rows = tables[m[1]].filter((r) => !gt || String(r.id) > gt).slice(0, limit);
        res.end(JSON.stringify(rows));
      } else if (url.pathname === '/auth/v1/admin/users') {
        res.end(JSON.stringify({ users: url.searchParams.get('page') === '1' ? users : [] }));
      } else {
        res.statusCode = 404;
        res.end('{"message":"nope"}');
      }
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    servers.push(server);
    return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  }

  const setup = async (seen: string[]) => {
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'backup-main-')), 'run');
    dirs.push(path.dirname(out));
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', await start(seen));
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    return out;
  };

  it('writes paginated tables without sensitive columns, a verifiable manifest and no users by default', async () => {
    const seen: string[] = [];
    const out = await setup(seen);
    expect(await main(['--out', out])).toBe(0);

    expect(JSON.parse(fs.readFileSync(path.join(out, 'polls.json'), 'utf8'))).toHaveLength(1200);
    const votes = JSON.parse(fs.readFileSync(path.join(out, 'votes.json'), 'utf8'));
    expect(votes).toEqual([{ id: 'v1', poll_id: 'p00000', option_id: 'o1' }]);
    expect(fs.existsSync(path.join(out, 'users.json'))).toBe(false);
    expect(seen.some((s) => s.includes('/auth/v1/admin/users'))).toBe(false);
    expect(seen.every((s) => s.startsWith('Bearer service-key'))).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8'));
    expect(manifest.files.map((f: { file: string; rows: number }) => [f.file, f.rows])).toEqual([
      ['polls.json', 1200],
      ['poll_options.json', 1],
      ['votes.json', 1],
    ]);
    for (const f of manifest.files) {
      const text = fs.readFileSync(path.join(out, f.file), 'utf8');
      expect(sha256(text)).toBe(f.sha256);
      expect(Buffer.byteLength(text)).toBe(f.bytes);
    }
    expect(JSON.stringify(manifest)).not.toContain('service-key');
    // two pages for 1200 polls, keyset on id
    expect(seen.filter((s) => s.includes('/rest/v1/polls')).length).toBe(2);
    expect(seen.find((s) => s.includes('id=gt.p00999'))).toBeDefined();
  });

  it('includes voter_token and ip_address only with --include-sensitive, and users only with --with-users', async () => {
    const seen: string[] = [];
    const out = await setup(seen);
    expect(await main(['--out', out, '--include-sensitive', '--with-users'])).toBe(0);
    const votes = JSON.parse(fs.readFileSync(path.join(out, 'votes.json'), 'utf8'));
    expect(votes[0]).toMatchObject({ voter_token: 'tok', ip_address: '1.2.3.4' });
    const exported = JSON.parse(fs.readFileSync(path.join(out, 'users.json'), 'utf8'));
    expect(exported).toEqual([{ id: 'u1', email: 'a@example.com', created_at: 'c', last_sign_in_at: 'l', email_confirmed_at: 'e' }]);
    const manifest = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8'));
    expect(manifest).toMatchObject({ include_sensitive: true, with_users: true });
  });

  it('--dry reads and writes nothing', async () => {
    const seen: string[] = [];
    const out = await setup(seen);
    expect(await main(['--out', out, '--dry'])).toBe(0);
    expect(seen).toEqual([]);
    expect(fs.existsSync(out)).toBe(false);
  });

  it('refuses an output directory that already has files and a missing key', async () => {
    const seen: string[] = [];
    const out = await setup(seen);
    fs.mkdirSync(out);
    fs.writeFileSync(path.join(out, 'old.json'), '[]');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await main(['--out', out])).toBe(3);
    expect(seen).toEqual([]);
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    expect(await main(['--out', out])).toBe(2);
  });
});
