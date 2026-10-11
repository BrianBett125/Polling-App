// Post-deploy smoke checks.
//
//   node scripts/smoke.js https://your-app.vercel.app [pollId] [--json]
//   npm run smoke -- https://your-app.vercel.app --json
//
// Read-only: it never votes or writes. Exit codes: 0 all checks passed (skips do not count
// as failures), 1 at least one check failed, 2 bad usage. With --json the only thing printed
// to stdout is one JSON document, so it can be piped into jq or stored by a monitor:
//   { base, ok, passed, failed, skipped, total, checks: [{ name, status, detail }] }
// where status is "pass", "fail" or "skip".

function parseArgs(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const positional = argv.filter((a) => !a.startsWith('--'));
  return {
    base: (positional[0] || '').replace(/\/$/, ''),
    pollId: positional[1],
    json: flags.has('--json'),
    unknown: [...flags].filter((f) => f !== '--json'),
  };
}

/** Counts and the overall verdict. A run with zero failures is ok, whatever was skipped. */
function summarize(base, checks) {
  const failed = checks.filter((c) => c.status === 'fail').length;
  const skipped = checks.filter((c) => c.status === 'skip').length;
  const passed = checks.length - failed - skipped;
  return { base, ok: failed === 0, passed, failed, skipped, total: checks.length, checks };
}

/** What /api/health returned, as a check outcome. 404 means the route is not deployed yet: skip. */
function judgeHealth(status, body) {
  if (status === 404) return { status: 'skip', detail: '/api/health not deployed (404)' };
  if (status !== 200) return { status: 'fail', detail: `status ${status}` };
  try {
    const parsed = JSON.parse(body);
    if (parsed && (parsed.ok === false || parsed.status === 'error' || parsed.status === 'down')) {
      return { status: 'fail', detail: `health reported unhealthy: ${body.slice(0, 200)}` };
    }
  } catch {
    // A non-JSON 200 still proves the route is up.
  }
  return { status: 'pass', detail: '200' };
}

async function runChecks(base, pollId, fetchImpl = fetch) {
  const checks = [];
  async function check(name, fn) {
    try {
      const out = await fn();
      if (out && typeof out === 'object' && out.status) checks.push({ name, status: out.status, detail: String(out.detail ?? '') });
      else checks.push({ name, status: 'pass', detail: String(out ?? '') });
    } catch (e) {
      checks.push({ name, status: 'fail', detail: e.message });
    }
  }
  const get = (p) => fetchImpl(base + p, { redirect: 'manual' });
  const must = (cond, msg) => {
    if (!cond) throw new Error(msg);
  };
  const loc = (r) => r.headers.get('location') || '';

  await check('/ serves the landing page with a way to create a poll', async () => {
    const r = await get('/');
    const t = await r.text();
    must(r.status === 200, `status ${r.status}`);
    must(/Ask the room/.test(t) && /href="\/polls\/new"/.test(t), 'landing headline or create-poll link missing');
    return r.status;
  });
  await check('/polls redirects anonymous users to /auth', async () => {
    const r = await get('/polls');
    must(r.status >= 300 && r.status < 400 && loc(r).includes('/auth'), `status ${r.status} location ${loc(r)}`);
    return loc(r);
  });
  await check('/polls/new redirects anonymous users to /auth', async () => {
    const r = await get('/polls/new');
    must(r.status >= 300 && r.status < 400 && loc(r).includes('/auth'), `status ${r.status} location ${loc(r)}`);
    return loc(r);
  });
  await check('/auth renders with sign in and sign up', async () => {
    const r = await get('/auth');
    const t = await r.text();
    must(r.status === 200, `status ${r.status}`);
    must(/sign in|log in|login/i.test(t) && /sign up|register|create account/i.test(t), 'sign in / sign up text missing');
    return r.status;
  });
  await check('malformed poll id shows the not-found page', async () => {
    const r = await get('/polls/not-a-uuid');
    const t = await r.text();
    must(/not found/i.test(t), `status ${r.status}, no not-found text`);
    return r.status;
  });
  await check('security headers present', async () => {
    const r = await get('/auth');
    must(r.headers.get('x-content-type-options') === 'nosniff', 'x-content-type-options missing');
    must(r.headers.get('x-frame-options') === 'SAMEORIGIN', 'x-frame-options missing');
    return 'ok';
  });
  await check('service role key not exposed in /auth HTML', async () => {
    const t = await (await get('/auth')).text();
    must(!/service_role/.test(t), 'service_role found in page');
    return 'ok';
  });
  await check('/api/health reports healthy (skipped when the route is not deployed)', async () => {
    const r = await get('/api/health');
    return judgeHealth(r.status, await r.text());
  });
  if (pollId) {
    await check('public poll page: 200, signed voter cookie, results and share panel', async () => {
      const r = await get(`/polls/${pollId}`);
      const t = await r.text();
      const cookie = r.headers.get('set-cookie') || '';
      must(r.status === 200, `status ${r.status}`);
      must(/poll_voter=/.test(cookie) && /HttpOnly/i.test(cookie), 'voter cookie missing or not HttpOnly');
      must(/Results/.test(t) && /Share this poll/.test(t), 'results/share panel missing');
      return 'ok';
    });
  }
  return summarize(base, checks);
}

function formatText(summary) {
  const label = { pass: 'PASS', fail: 'FAIL', skip: 'SKIP' };
  const lines = summary.checks.map((c) => `${label[c.status]}  ${c.name}  ${c.detail}`);
  lines.push('', `${summary.passed}/${summary.total} passed` + (summary.skipped ? `, ${summary.skipped} skipped` : '') + (summary.failed ? `, ${summary.failed} failed` : ''));
  return lines.join('\n');
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (!args.base || args.unknown.length) {
    console.error(args.unknown.length ? `unknown option: ${args.unknown.join(', ')}` : '');
    console.error('usage: node scripts/smoke.js <base-url> [pollId] [--json]');
    return 2;
  }
  let summary;
  try {
    new URL(args.base);
  } catch {
    console.error(`not a valid URL: ${args.base}`);
    return 2;
  }
  summary = await runChecks(args.base, args.pollId);
  console.log(args.json ? JSON.stringify(summary, null, 2) : formatText(summary));
  return summary.ok ? 0 : 1;
}

module.exports = { parseArgs, summarize, judgeHealth, runChecks, formatText, main };

if (require.main === module) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(err.message);
      process.exit(1);
    },
  );
}
