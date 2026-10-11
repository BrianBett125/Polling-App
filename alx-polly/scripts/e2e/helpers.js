// Pure helpers for the live e2e run. No network, no browser, no filesystem writes, so they are
// unit tested in lib/e2e-helpers.test.ts. run.js is the only file that touches the outside world.
const crypto = require('crypto');
const fs = require('fs');

function parseArgs(argv) {
  const dry = argv.includes('--dry') || argv.includes('--dry-run');
  const help = argv.includes('--help') || argv.includes('-h');
  const unknown = argv.filter((a) => !['--dry', '--dry-run', '--help', '-h'].includes(a));
  return { dry, help, unknown };
}

const trimSlash = (s) => s.replace(/\/+$/, '');

/**
 * Validates the environment. Returns { config, problems }; config is null when anything is wrong.
 * Problems never include the value of the service role key.
 */
function readConfig(env) {
  const problems = [];
  const siteRaw = (env.SITE_URL || '').trim();
  const sbRaw = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const key = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!siteRaw) problems.push('SITE_URL is not set (for example https://polling-app-green.vercel.app)');
  if (!sbRaw) problems.push('SUPABASE_URL is not set (the project URL, https://<ref>.supabase.co)');
  if (!key) problems.push('SUPABASE_SERVICE_ROLE_KEY is not set');

  let site = null;
  let supabase = null;
  if (siteRaw) {
    try {
      site = new URL(siteRaw);
      if (!['http:', 'https:'].includes(site.protocol)) throw new Error('protocol');
    } catch {
      problems.push('SITE_URL is not a valid http(s) URL');
      site = null;
    }
  }
  if (sbRaw) {
    try {
      supabase = new URL(sbRaw);
      if (!['http:', 'https:'].includes(supabase.protocol)) throw new Error('protocol');
    } catch {
      problems.push('SUPABASE_URL is not a valid http(s) URL');
      supabase = null;
    }
  }
  if (problems.length) return { config: null, problems };
  return {
    config: {
      siteUrl: trimSlash(site.origin + site.pathname),
      siteIsHttps: site.protocol === 'https:',
      supabaseUrl: trimSlash(supabase.origin),
      serviceRoleKey: key,
      chromePath: (env.CHROME_PATH || '').trim() || null,
    },
    problems: [],
  };
}

/** First Chrome/Chromium path that exists: CHROME_PATH if set, else common install locations. */
function findChrome(env, exists = fs.existsSync, platform = process.platform) {
  if (env.CHROME_PATH && env.CHROME_PATH.trim()) {
    return exists(env.CHROME_PATH.trim()) ? { path: env.CHROME_PATH.trim(), source: 'CHROME_PATH' } : { path: null, source: 'CHROME_PATH (file not found)' };
  }
  const candidates = {
    linux: ['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'],
    darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'],
    win32: ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'],
  }[platform] || [];
  const hit = candidates.find((c) => exists(c));
  return hit ? { path: hit, source: 'auto-detected' } : { path: null, source: 'none found' };
}

/** A user that cannot collide with a real one: example.com is reserved and never delivers mail. */
function makeThrowaway(now = Date.now(), random = () => crypto.randomBytes(6).toString('hex')) {
  const tag = `${now.toString(36)}-${random()}`;
  return {
    tag,
    email: `e2e-throwaway-${tag}@example.com`,
    // Mixed classes so it passes any password policy; random so it is useless after the run.
    password: `Aa1!${crypto.randomBytes(12).toString('hex')}`,
    pollTitle: `E2E poll ${tag}`,
    editedTitle: `E2E poll ${tag} (edited)`,
  };
}

/**
 * The voter cookie must be HttpOnly. On https it must also be Secure and carry the __Host- prefix
 * (which the browser itself enforces: Secure, Path=/, no Domain). On plain http (a local run) the
 * unprefixed name is acceptable. Throws an Error naming what is wrong.
 */
function assertVoterCookie(cookies, siteIsHttps) {
  const c = cookies.find((x) => x.name === '__Host-poll_voter') || (!siteIsHttps ? cookies.find((x) => x.name === 'poll_voter') : undefined);
  if (!c) throw new Error(`voter cookie missing; cookies present: ${cookies.map((x) => x.name).join(', ') || 'none'}`);
  if (!c.httpOnly) throw new Error(`${c.name} is not HttpOnly`);
  if (siteIsHttps && !c.secure) throw new Error(`${c.name} is not Secure on https`);
  if (siteIsHttps && c.name !== '__Host-poll_voter') throw new Error('voter cookie lacks the __Host- prefix on https');
  if (c.path !== '/') throw new Error(`${c.name} path is ${c.path}, expected /`);
  return c.name;
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Poll id from a /polls/<uuid> URL, or null. */
function pollIdFromUrl(url) {
  let p;
  try {
    p = new URL(url).pathname;
  } catch {
    return null;
  }
  const m = p.match(new RegExp(`^/polls/(${UUID.source})/?$`, 'i'));
  return m ? m[1].toLowerCase() : null;
}

/** The canonical share URL for a poll on a site. */
function pollUrl(siteUrl, id) {
  return `${trimSlash(siteUrl)}/polls/${id}`;
}

/** Replaces every secret in a string. Used on anything that is printed. */
function redact(text, secrets) {
  let out = String(text);
  for (const s of secrets) if (s && s.length >= 6) out = out.split(s).join('[redacted]');
  return out;
}

function describePlan(config, chrome, throwaway) {
  return [
    `Target site:      ${config.siteUrl}`,
    `Supabase project: ${config.supabaseUrl}`,
    `Browser:          ${chrome.path || 'NOT FOUND'} (${chrome.source})`,
    `Throwaway user:   ${throwaway.email}`,
    '',
    'Steps that would run:',
    '  1. create the pre-confirmed throwaway user (Supabase admin API)',
    '  2. sign in through the UI',
    '  3. create a poll with two options',
    '  4. check the QR code renders and the share link equals the poll URL',
    '  5. anonymous voter, fresh browser context: check voter cookie flags, vote, see 100% and "Your vote"',
    '  6. reload: the vote form is gone, the vote is still shown',
    '  7. second anonymous voter, fresh context: votes for the other option, results show 50% / 50%',
    '  8. owner edits the title',
    '  9. owner deletes the poll, the poll URL now shows "Poll not found"',
    ' 10. always: delete leftover polls of the user, then the user',
  ].join('\n');
}

module.exports = { parseArgs, readConfig, findChrome, makeThrowaway, assertVoterCookie, pollIdFromUrl, pollUrl, redact, describePlan };
