import { afterEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const smoke = require('../scripts/smoke.js');

const script = path.join(__dirname, '..', 'scripts', 'smoke.js');

describe('parseArgs', () => {
  it('splits flags from positionals and trims a trailing slash', () => {
    expect(smoke.parseArgs(['https://a.example/', 'abc', '--json'])).toEqual({ base: 'https://a.example', pollId: 'abc', json: true, unknown: [] });
    expect(smoke.parseArgs(['--json', 'https://a.example']).base).toBe('https://a.example');
    expect(smoke.parseArgs(['https://a.example', '--wat']).unknown).toEqual(['--wat']);
    expect(smoke.parseArgs([]).base).toBe('');
  });
});

describe('summarize', () => {
  it('treats skips as neither pass nor fail', () => {
    const s = smoke.summarize('b', [
      { name: 'a', status: 'pass', detail: '' },
      { name: 'b', status: 'skip', detail: '' },
      { name: 'c', status: 'fail', detail: '' },
    ]);
    expect(s).toMatchObject({ ok: false, passed: 1, failed: 1, skipped: 1, total: 3 });
    expect(smoke.summarize('b', [{ name: 'a', status: 'skip', detail: '' }]).ok).toBe(true);
  });
});

describe('judgeHealth', () => {
  it('skips on 404, passes on 200, fails otherwise or when the body says unhealthy', () => {
    expect(smoke.judgeHealth(404, '').status).toBe('skip');
    expect(smoke.judgeHealth(200, '{"ok":true}').status).toBe('pass');
    expect(smoke.judgeHealth(200, 'OK').status).toBe('pass');
    expect(smoke.judgeHealth(200, '{"ok":false}').status).toBe('fail');
    expect(smoke.judgeHealth(200, '{"status":"error"}').status).toBe('fail');
    expect(smoke.judgeHealth(503, '').status).toBe('fail');
    expect(smoke.judgeHealth(302, '').status).toBe('fail');
  });
});

describe('smoke.js against a stub app', () => {
  const servers: http.Server[] = [];
  afterEach(() => {
    for (const s of servers.splice(0)) s.close();
  });

  async function stub(health: (res: http.ServerResponse) => void) {
    const server = http.createServer((req, res) => {
      const headers = { 'x-content-type-options': 'nosniff', 'x-frame-options': 'SAMEORIGIN' };
      switch (req.url) {
        case '/':
          res.writeHead(200, { ...headers, 'content-type': 'text/html' }).end('<h1>Ask the room.</h1><a href="/polls/new">Create a poll</a>');
          break;
        case '/polls':
        case '/polls/new':
          res.writeHead(307, { location: '/auth?next=' + req.url }).end();
          break;
        case '/auth':
          res.writeHead(200, headers).end('<h1>Sign In</h1><button>Sign Up</button>');
          break;
        case '/polls/not-a-uuid':
          res.writeHead(404, headers).end('<h1>Poll not found</h1>');
          break;
        case '/api/health':
          health(res);
          break;
        default:
          res.writeHead(404).end();
      }
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    servers.push(server);
    return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  }

  const run = (args: string[]) =>
    new Promise<{ code: number | null; out: string; err: string }>((resolve) => {
      const child = spawn(process.execPath, [script, ...args], { env: { PATH: process.env.PATH ?? '' } as unknown as NodeJS.ProcessEnv });
      let out = '';
      let err = '';
      child.stdout.on('data', (d) => (out += d));
      child.stderr.on('data', (d) => (err += d));
      child.on('close', (code) => resolve({ code, out, err }));
    });

  it('--json prints one parseable document and exits 0; a missing /api/health is skipped', async () => {
    const base = await stub((res) => res.writeHead(404).end());
    const { code, out } = await run([base, '--json']);
    expect(code).toBe(0);
    const doc = JSON.parse(out);
    expect(doc).toMatchObject({ base, ok: true, failed: 0, skipped: 1, passed: 7, total: 8 });
    expect(doc.checks.find((c: { name: string }) => c.name.includes('/api/health')).status).toBe('skip');
  });

  it('a healthy /api/health passes and an unhealthy one fails the run', async () => {
    const good = await stub((res) => res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}'));
    const r1 = await run([good, '--json']);
    expect(r1.code).toBe(0);
    expect(JSON.parse(r1.out)).toMatchObject({ passed: 8, skipped: 0 });

    const bad = await stub((res) => res.writeHead(503).end('{"ok":false}'));
    const r2 = await run([bad, '--json']);
    expect(r2.code).toBe(1);
    expect(JSON.parse(r2.out)).toMatchObject({ ok: false, failed: 1 });
  });

  it('text mode keeps PASS/SKIP/FAIL lines and a count', async () => {
    const base = await stub((res) => res.writeHead(404).end());
    const { code, out } = await run([base]);
    expect(code).toBe(0);
    expect(out).toMatch(/^PASS {2}\/ serves the landing page/m);
    expect(out).toMatch(/^SKIP {2}\/api\/health/m);
    expect(out).toMatch(/7\/8 passed, 1 skipped/);
  });

  it('fails every check (exit 1) when the site is unreachable, and exits 2 on bad usage', async () => {
    const r = await run(['http://127.0.0.1:9', '--json']);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).failed).toBeGreaterThan(0);
    expect((await run([])).code).toBe(2);
    expect((await run(['not a url'])).code).toBe(2);
    expect((await run(['http://x.example', '--bogus'])).code).toBe(2);
  });
});
