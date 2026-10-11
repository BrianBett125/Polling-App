// Live end-to-end run against a deployed copy of the app. See README.md in this directory.
//
//   SITE_URL=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... [CHROME_PATH=...] node run.js
//   node run.js --dry        checks the environment and prints the plan; touches nothing
//
// Exit codes: 0 every step passed and cleanup is verified, 1 a step failed, 2 bad usage or
// environment, 3 steps passed but cleanup could not be verified (a throwaway user may remain).
const fs = require('fs');
const path = require('path');
const h = require('./helpers');

const STEP_TIMEOUT = Number(process.env.E2E_TIMEOUT_MS) || 20000;
const ARTIFACT_DIR = path.join(__dirname, 'artifacts');

/** Polls until fn() returns truthy. Playwright has no built-in for "input value became non-empty". */
async function until(fn, what, timeout = STEP_TIMEOUT) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    last = await fn().catch((e) => e);
    if (last === true) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`timed out waiting for ${what}${last instanceof Error ? `: ${last.message}` : ''}`);
}

function adminClient(config) {
  const headers = { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}` };
  return async function admin(method, pathAndQuery, body, extra = {}) {
    const res = await fetch(config.supabaseUrl + pathAndQuery, {
      method,
      headers: { ...headers, ...(body ? { 'content-type': 'application/json' } : {}), ...extra },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // keep text
    }
    return { status: res.status, ok: res.ok, json, text: text.slice(0, 300) };
  };
}

async function main() {
  const args = h.parseArgs(process.argv.slice(2));
  if (args.help || args.unknown.length) {
    if (args.unknown.length) console.error(`unknown arguments: ${args.unknown.join(' ')}`);
    console.log('usage: node run.js [--dry]\nenv: SITE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CHROME_PATH (optional), E2E_NO_SANDBOX=1 (optional)');
    return args.unknown.length ? 2 : 0;
  }

  const { config, problems } = h.readConfig(process.env);
  if (!config) {
    console.error('Environment problems:\n' + problems.map((p) => `  - ${p}`).join('\n'));
    return 2;
  }
  const chrome = h.findChrome(process.env);
  const throwaway = h.makeThrowaway();

  console.log(h.describePlan(config, chrome, throwaway));

  if (args.dry) {
    let pw = 'installed';
    try {
      require.resolve('playwright-core');
    } catch {
      pw = 'NOT installed (run npm ci in scripts/e2e)';
    }
    console.log(`\nplaywright-core:  ${pw}`);
    console.log('\nDry run: no network calls were made and nothing was created.');
    return chrome.path ? 0 : 2;
  }
  if (!chrome.path) {
    console.error('\nNo Chrome or Chromium found. Set CHROME_PATH to the executable.');
    return 2;
  }

  const { chromium } = require('playwright-core');
  const admin = adminClient(config);
  const secrets = [config.serviceRoleKey, throwaway.password];
  const results = [];
  let userId = null;
  let browser = null;
  let failed = false;
  let cleanupFailed = false;
  const warnings = [];

  async function step(name, fn) {
    if (failed) {
      results.push({ name, status: 'skipped' });
      console.log(`SKIP  ${name}`);
      return;
    }
    const t0 = Date.now();
    try {
      await fn();
      results.push({ name, status: 'pass' });
      console.log(`PASS  ${name}  (${Date.now() - t0} ms)`);
    } catch (e) {
      failed = true;
      results.push({ name, status: 'fail', detail: h.redact(e.message, secrets) });
      console.log(`FAIL  ${name}\n      ${h.redact(e.message, secrets).split('\n')[0]}`);
      await screenshotAll(name);
    }
  }

  const pages = {};
  async function screenshotAll(stepName) {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    for (const [who, page] of Object.entries(pages)) {
      try {
        const file = path.join(ARTIFACT_DIR, `${throwaway.tag}-${who}.png`);
        await page.screenshot({ path: file, fullPage: true });
        console.log(`      screenshot (${who}, URL ${page.url()}): ${file}`);
      } catch {
        // page may be closed; the failure message is what matters
      }
    }
    void stepName;
  }

  const ctxOpts = { ignoreHTTPSErrors: false };
  let pollId = null;
  let url = null;
  let ownerCtx;
  let owner;

  try {
    await step('create the pre-confirmed throwaway user', async () => {
      const r = await admin('POST', '/auth/v1/admin/users', { email: throwaway.email, password: throwaway.password, email_confirm: true });
      if (!r.ok || !r.json?.id) throw new Error(`admin create user failed: HTTP ${r.status} ${h.redact(r.text, secrets)}`);
      userId = r.json.id;
    });

    await step('launch the browser', async () => {
      browser = await chromium.launch({
        executablePath: chrome.path,
        headless: true,
        args: process.env.E2E_NO_SANDBOX ? ['--no-sandbox'] : [],
      });
      ownerCtx = await browser.newContext(ctxOpts);
      ownerCtx.setDefaultTimeout(STEP_TIMEOUT);
      owner = await ownerCtx.newPage();
      pages.owner = owner;
    });

    await step('sign in through the UI', async () => {
      // networkidle: React must hydrate first, or the click does a native form GET with the password in the URL.
      await owner.goto(`${config.siteUrl}/auth`, { waitUntil: 'networkidle' });
      await owner.getByLabel('Email').fill(throwaway.email);
      await owner.getByLabel('Password').fill(throwaway.password);
      await owner.getByRole('button', { name: 'Sign In', exact: true }).click();
      await owner.waitForURL((u) => !u.pathname.startsWith('/auth'));
    });

    await step('create a poll', async () => {
      await owner.goto(`${config.siteUrl}/polls/new`, { waitUntil: 'networkidle' });
      await owner.getByLabel('Title').fill(throwaway.pollTitle);
      await owner.getByPlaceholder('Option 1').fill('Alpha');
      await owner.getByPlaceholder('Option 2').fill('Beta');
      await owner.getByRole('button', { name: 'Create Poll' }).click();
      await owner.waitForURL((u) => !!h.pollIdFromUrl(u.href));
      pollId = h.pollIdFromUrl(owner.url());
      url = h.pollUrl(new URL(owner.url()).origin, pollId);
      if (new URL(owner.url()).origin !== new URL(config.siteUrl).origin) {
        warnings.push(`SITE_URL origin ${new URL(config.siteUrl).origin} redirected to ${new URL(owner.url()).origin}`);
      }
    });

    await step('QR code renders and the share link equals the poll URL', async () => {
      const qr = owner.getByRole('img', { name: /QR code/i });
      await qr.waitFor({ state: 'visible' });
      const box = await qr.boundingBox();
      if (!box || box.width < 100 || box.height < 100) throw new Error(`QR code is too small to scan: ${JSON.stringify(box)}`);
      const shapes = await qr.locator('path').count();
      if (shapes < 1) throw new Error('QR code svg has no drawn modules');
      const link = owner.getByLabel('Poll link');
      await until(async () => (await link.inputValue()) !== '', 'the share link to fill in');
      const value = await link.inputValue();
      if (value !== url) throw new Error(`share link ${value} does not equal the poll URL ${url}`);
    });

    const voterA = { name: 'first anonymous voter' };
    async function newVoter(who) {
      const ctx = await browser.newContext(ctxOpts);
      ctx.setDefaultTimeout(STEP_TIMEOUT);
      const page = await ctx.newPage();
      pages[who] = page;
      await page.goto(url, { waitUntil: 'networkidle' });
      return { ctx, page };
    }
    const bar = (page, text, pct) => page.getByRole('progressbar', { name: `${text}: ${pct}% of votes` });
    const yourVoteOn = (page, text) => page.getByRole('listitem').filter({ hasText: text }).filter({ hasText: 'Your vote' });
    let a;
    let b;

    await step(`${voterA.name} (fresh context) gets an HttpOnly${config.siteIsHttps ? ', Secure, __Host-' : ''} voter cookie`, async () => {
      a = await newVoter('voterA');
      const cookies = await a.ctx.cookies(url);
      h.assertVoterCookie(cookies, config.siteIsHttps);
    });

    await step('first voter votes Alpha: results 100% and "Your vote"', async () => {
      await a.page.getByRole('radio', { name: 'Alpha' }).check();
      await a.page.getByRole('button', { name: 'Submit vote' }).click();
      await bar(a.page, 'Alpha', 100).waitFor({ state: 'attached' });
      await yourVoteOn(a.page, 'Alpha').waitFor({ state: 'visible' });
      await bar(a.page, 'Beta', 0).waitFor({ state: 'attached' });
    });

    await step('reload: the vote form is gone and the vote cannot be repeated', async () => {
      await a.page.reload({ waitUntil: 'networkidle' });
      await yourVoteOn(a.page, 'Alpha').waitFor({ state: 'visible' });
      const forms = await a.page.getByRole('button', { name: 'Submit vote' }).count();
      if (forms !== 0) throw new Error('the Submit vote button is still offered after voting');
      await bar(a.page, 'Alpha', 100).waitFor({ state: 'attached' });
    });

    await step('second anonymous voter (fresh context) votes Beta: results 50% / 50%', async () => {
      b = await newVoter('voterB');
      h.assertVoterCookie(await b.ctx.cookies(url), config.siteIsHttps);
      await b.page.getByRole('radio', { name: 'Beta' }).check();
      await b.page.getByRole('button', { name: 'Submit vote' }).click();
      await bar(b.page, 'Alpha', 50).waitFor({ state: 'attached' });
      await bar(b.page, 'Beta', 50).waitFor({ state: 'attached' });
      await yourVoteOn(b.page, 'Beta').waitFor({ state: 'visible' });
    });

    await step('first voter still sees their own vote on Alpha, now at 50%', async () => {
      await a.page.reload({ waitUntil: 'networkidle' });
      await bar(a.page, 'Alpha', 50).waitFor({ state: 'attached' });
      await yourVoteOn(a.page, 'Alpha').waitFor({ state: 'visible' });
    });

    await step('owner edits the title', async () => {
      await owner.goto(`${url}/edit`, { waitUntil: 'networkidle' });
      await owner.getByLabel('Title').fill(throwaway.editedTitle);
      await owner.getByRole('button', { name: 'Save' }).click();
      await owner.waitForURL((u) => h.pollIdFromUrl(u.href) === pollId);
      await owner.getByRole('heading', { level: 1, name: throwaway.editedTitle }).waitFor({ state: 'visible' });
    });

    await step('owner deletes the poll', async () => {
      await owner.goto(`${config.siteUrl}/polls`, { waitUntil: 'networkidle' });
      // The nearest ancestor of this poll's link that also holds a Delete button is its own card.
      const card = owner.locator(`xpath=//a[contains(@href,"/polls/${pollId}")]/ancestor::*[.//button[normalize-space()="Delete"]][1]`);
      owner.once('dialog', (d) => d.accept());
      await card.getByRole('button', { name: 'Delete' }).click();
      await owner.locator(`a[href="/polls/${pollId}"]`).waitFor({ state: 'detached' });
    });

    await step('the deleted poll URL shows "Poll not found" (HTTP 404) to the owner and to an anonymous visitor', async () => {
      for (const [who, page] of [['owner', owner], ['anonymous', b.page]]) {
        const res = await page.goto(url, { waitUntil: 'networkidle' });
        if (res.status() !== 404) throw new Error(`${who}: expected HTTP 404, got ${res.status()}`);
        await page.getByRole('heading', { name: 'Poll not found' }).waitFor({ state: 'visible' });
      }
    });
  } finally {
    // Always runs: close the browser, delete the user's polls (the votes cascade), then the user.
    if (browser) await browser.close().catch(() => {});
    if (userId) {
      const cleanup = await cleanUp(admin, userId, secrets);
      results.push({ name: 'cleanup: delete polls, then the throwaway user', status: cleanup.ok ? 'pass' : 'fail', detail: cleanup.detail });
      console.log(`${cleanup.ok ? 'PASS' : 'FAIL'}  cleanup: ${cleanup.detail}`);
      if (!cleanup.ok) console.log(`      MANUAL CLEANUP NEEDED: delete polls where created_by = ${userId}, then the auth user ${throwaway.email}`);
      if (!cleanup.ok) cleanupFailed = true;
    }
  }

  for (const w of warnings) console.log(`WARN  ${w}`);
  const stepFailures = results.filter((r) => r.status === 'fail' && !r.name.startsWith('cleanup')).length;
  const ran = results.filter((r) => r.status === 'pass').length;
  console.log(`\n${ran}/${results.length} passed${stepFailures ? `, ${stepFailures} failed` : ''}`);
  if (stepFailures) return 1;
  return cleanupFailed ? 3 : 0;
}

/** Deletes polls created by the user, then the user, then checks both are really gone. */
async function cleanUp(admin, userId, secrets) {
  const notes = [];
  try {
    const del = await admin('DELETE', `/rest/v1/polls?created_by=eq.${userId}`, null, { Prefer: 'return=representation' });
    if (!del.ok) return { ok: false, detail: `deleting polls failed: HTTP ${del.status} ${h.redact(del.text, secrets)}` };
    notes.push(`${Array.isArray(del.json) ? del.json.length : '?'} leftover poll(s) removed`);
    const user = await admin('DELETE', `/auth/v1/admin/users/${userId}`);
    if (!user.ok) return { ok: false, detail: `deleting the user failed: HTTP ${user.status} ${h.redact(user.text, secrets)}` };
    const polls = await admin('GET', `/rest/v1/polls?created_by=eq.${userId}&select=id`);
    if (!polls.ok || !Array.isArray(polls.json) || polls.json.length) return { ok: false, detail: 'polls still present after cleanup' };
    const gone = await admin('GET', `/auth/v1/admin/users/${userId}`);
    if (gone.status !== 404) return { ok: false, detail: `user still present after delete (HTTP ${gone.status})` };
    notes.push('user deleted and verified gone');
    return { ok: true, detail: notes.join(', ') };
  } catch (e) {
    return { ok: false, detail: h.redact(e.message, secrets) };
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`e2e crashed: ${err.message}`);
    process.exit(1);
  },
);
