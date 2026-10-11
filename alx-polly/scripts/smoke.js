// Post-deploy smoke checks. Usage: node scripts/smoke.js https://your-app.vercel.app [pollId]
// Exits 1 if any check fails. Read-only: it never votes or writes.
const base = (process.argv[2] || '').replace(/\/$/, '');
const pollId = process.argv[3];
if (!base) {
  console.error('usage: node scripts/smoke.js <base-url> [pollId]');
  process.exit(2);
}

const results = [];
async function check(name, fn) {
  try {
    results.push({ name, ok: true, detail: await fn() });
  } catch (e) {
    results.push({ name, ok: false, detail: e.message });
  }
}
const get = (p) => fetch(base + p, { redirect: 'manual' });
const must = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
const loc = (r) => r.headers.get('location') || '';

(async () => {
  await check('/ redirects to /polls', async () => {
    const r = await get('/');
    must([307, 308].includes(r.status) && loc(r).endsWith('/polls'), `status ${r.status} location ${loc(r)}`);
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
  const failed = results.filter((r) => !r.ok).length;
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  ${r.detail ?? ''}`);
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
