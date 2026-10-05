import { beforeEach, describe, expect, it } from 'vitest';
import { newVoterSecret, signVoterCookie, verifyVoterCookie, voterCookieToIssue } from './voter-cookie';

const ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.VOTER_COOKIE_SECRET = 'unit-test-signing-key';
});

describe('signed voter cookie', () => {
  it('round-trips a secret it issued', async () => {
    const s = newVoterSecret();
    const cookie = await signVoterCookie(s);
    expect(cookie).toMatch(/^[0-9a-f]{64}\.[0-9a-f]{64}$/);
    expect(await verifyVoterCookie(cookie)).toBe(s);
  });

  it('rejects a well-formed cookie the server did not issue', async () => {
    const forged = `${newVoterSecret()}.${'0'.repeat(64)}`;
    expect(await verifyVoterCookie(forged)).toBeNull();
    expect(await verifyVoterCookie(newVoterSecret())).toBeNull(); // bare secret, no signature
  });

  it('rejects a tampered secret or signature', async () => {
    const [s, sig] = (await signVoterCookie(newVoterSecret()))!.split('.');
    const flip = (h: string) => (h[0] === 'a' ? 'b' : 'a') + h.slice(1);
    expect(await verifyVoterCookie(`${flip(s)}.${sig}`)).toBeNull();
    expect(await verifyVoterCookie(`${s}.${flip(sig)}`)).toBeNull();
  });

  it('rejects cookies signed under a different key', async () => {
    const cookie = await signVoterCookie(newVoterSecret());
    process.env.VOTER_COOKIE_SECRET = 'another-key';
    expect(await verifyVoterCookie(cookie)).toBeNull();
  });

  it.each([undefined, null, '', 'abc', 42, `${'g'.repeat(64)}.${'0'.repeat(64)}`])('rejects junk %j', async (v) => {
    expect(await verifyVoterCookie(v)).toBeNull();
  });

  it('falls back to the service role key, and refuses everything with no key at all', async () => {
    delete process.env.VOTER_COOKIE_SECRET;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    const s = newVoterSecret();
    expect(await verifyVoterCookie(await signVoterCookie(s))).toBe(s);
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(await signVoterCookie(s)).toBeNull();
    expect(await verifyVoterCookie(`${s}.${'0'.repeat(64)}`)).toBeNull();
  });
});

describe('voterCookieToIssue (middleware rule)', () => {
  it('issues a verifiable cookie on a first poll page visit', async () => {
    const issued = await voterCookieToIssue(`/polls/${ID}`, undefined);
    expect(await verifyVoterCookie(issued)).not.toBeNull();
  });

  it.each([`/polls/${ID}/`, `/polls/${ID.toUpperCase()}`, `/polls/${ID.replace('a', '%61')}`.replace('%61', 'a'), `/polls//${ID}`])(
    'also issues for %s',
    async (p) => {
      expect(await voterCookieToIssue(p, undefined)).not.toBeNull();
    },
  );

  it('issues for a percent-encoded uuid', async () => {
    expect(await voterCookieToIssue(`/polls/${ID.replace('-', '%2D')}`, undefined)).not.toBeNull();
  });

  it('keeps an existing valid cookie, replaces a forged or malformed one', async () => {
    const good = (await signVoterCookie(newVoterSecret()))!;
    expect(await voterCookieToIssue(`/polls/${ID}`, good)).toBeNull();
    expect(await voterCookieToIssue(`/polls/${ID}`, `${newVoterSecret()}.${'0'.repeat(64)}`)).not.toBeNull();
    expect(await voterCookieToIssue(`/polls/${ID}`, 'junk')).not.toBeNull();
  });

  it.each(['/', '/auth', '/polls', '/polls/new', `/polls/${ID}/edit`, '/polls/not-a-uuid', '/polls/%E0%A4%A', '/other'])(
    'issues nothing for %s',
    async (p) => {
      expect(await voterCookieToIssue(p, undefined)).toBeNull();
    },
  );

  it('issues nothing when no signing key is configured', async () => {
    delete process.env.VOTER_COOKIE_SECRET;
    expect(await voterCookieToIssue(`/polls/${ID}`, undefined)).toBeNull();
  });
});
