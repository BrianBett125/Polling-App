import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { redirectedTo: path });
  }),
}));

// Cookie jar shared with the action under test.
const jar = new Map<string, string>();
const cookieSet = vi.fn((name: string, value: string, _opts?: unknown) => void jar.set(name, value));
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n)! } : undefined), set: cookieSet })),
}));

const userClient: any = { rpc: vi.fn(), from: vi.fn(), auth: { getUser: vi.fn() } };
const adminClient: any = { rpc: vi.fn() };
let adminAvailable = true;
vi.mock('./supabase-server', () => ({
  getServerSupabase: vi.fn(async () => userClient),
  getAdminSupabase: vi.fn(() => (adminAvailable ? adminClient : null)),
  getCurrentUser: vi.fn(async (s: any) => (await s.auth.getUser()).data.user ?? null),
}));

const withinRateLimit = vi.fn(async (_action: string, _identity: string) => true);
const currentClientIp = vi.fn(async () => '203.0.113.9');
vi.mock('./rate-limit', () => ({
  withinRateLimit: (a: string, i: string) => withinRateLimit(a, i),
  currentClientIp: () => currentClientIp(),
  RATE_LIMITED_MESSAGE: 'Too many attempts. Please wait a few minutes and try again.',
}));
const verifyCaptcha = vi.fn(async (_t?: string | null, _ip?: string | null) => true);
vi.mock('./captcha', () => ({ verifyCaptcha: (t?: string | null, ip?: string | null) => verifyCaptcha(t, ip) }));

import { voteForOption, createPoll, deletePollAction, updatePollAction } from './actions';
import { revalidatePath } from 'next/cache';
import { VOTER_COOKIE, signVoterCookie } from './voter';

const POLL = '11111111-1111-4111-8111-111111111111';
const OPT = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';
const SECRET = 'ab'.repeat(32);
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

beforeEach(() => {
  vi.clearAllMocks();
  jar.clear();
  process.env.VOTER_COOKIE_SECRET = 'unit-test-signing-key';
  adminAvailable = true;
  withinRateLimit.mockResolvedValue(true);
  verifyCaptcha.mockResolvedValue(true);
  userClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER } } });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('voteForOption', () => {
  it('stores a hashed server-issued browser token and revalidates', async () => {
    jar.set(VOTER_COOKIE, (await signVoterCookie(SECRET))!);
    adminClient.rpc.mockResolvedValue({ data: 'vote-1', error: null });

    const res = await voteForOption(OPT, POLL);

    expect(adminClient.rpc).toHaveBeenCalledWith('cast_vote', {
      p_poll_id: POLL,
      p_option_id: OPT,
      p_voter_token: sha(SECRET),
      p_user_id: USER,
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/polls/${POLL}`);
    expect(res).toEqual({ success: true, voteId: 'vote-1' });
    expect(adminClient.rpc.mock.calls[0][1].p_voter_token).not.toBe(SECRET);
  });

  it('never mints an identity itself: no cookie means no vote and no database call', async () => {
    const res = await voteForOption(OPT, POLL);
    expect(res).toEqual({ success: false, error: 'We could not identify your browser. Enable cookies and try again.' });
    expect(adminClient.rpc).not.toHaveBeenCalled();
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it('rejects a well-formed cookie the server never issued (client-chosen identity)', async () => {
    jar.set(VOTER_COOKIE, `${SECRET}.${'0'.repeat(64)}`);
    expect((await voteForOption(OPT, POLL)).success).toBe(false);
    jar.set(VOTER_COOKIE, SECRET); // bare 64-hex, the old unsigned format
    expect((await voteForOption(OPT, POLL)).success).toBe(false);
    expect(adminClient.rpc).not.toHaveBeenCalled();
  });

  it('rejects a malformed cookie instead of trusting it', async () => {
    jar.set(VOTER_COOKIE, 'not-a-valid-secret');
    const res = await voteForOption(OPT, POLL);
    expect(res.success).toBe(false);
    expect(adminClient.rpc).not.toHaveBeenCalled();
  });

  it('votes anonymously when nobody is signed in or the auth lookup fails', async () => {
    jar.set(VOTER_COOKIE, (await signVoterCookie(SECRET))!);
    adminClient.rpc.mockResolvedValue({ data: 'v', error: null });
    userClient.auth.getUser.mockRejectedValue(new Error('auth down'));
    const res = await voteForOption(OPT, POLL);
    expect(res.success).toBe(true);
    expect(adminClient.rpc.mock.calls[0][1].p_user_id).toBeNull();
  });

  it('reports a duplicate vote without claiming success', async () => {
    jar.set(VOTER_COOKIE, (await signVoterCookie(SECRET))!);
    adminClient.rpc.mockResolvedValue({ data: null, error: { code: 'VT002', message: 'ALREADY_VOTED' } });
    const res = await voteForOption(OPT, POLL);
    expect(res).toEqual({ success: false, error: 'You have already voted on this poll from this browser.', code: 'already_voted' });
  });

  it.each([
    ['VT003', 'This poll no longer exists.'],
    ['VT004', 'That option is not part of this poll. Reload the page and try again.'],
  ])('maps database code %s to a friendly message', async (code, message) => {
    jar.set(VOTER_COOKIE, (await signVoterCookie(SECRET))!);
    adminClient.rpc.mockResolvedValue({ data: null, error: { code, message: 'raw' } });
    expect(await voteForOption(OPT, POLL)).toEqual({ success: false, error: message });
  });

  it('hides raw database errors from the visitor', async () => {
    jar.set(VOTER_COOKIE, (await signVoterCookie(SECRET))!);
    adminClient.rpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'relation "votes" is broken at 10.0.0.5' } });
    const res = await voteForOption(OPT, POLL);
    expect(res.success).toBe(false);
    expect(JSON.stringify(res)).not.toMatch(/votes|10\.0\.0\.5|XX000/);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('survives a thrown error (network down) with a generic failure', async () => {
    jar.set(VOTER_COOKIE, (await signVoterCookie(SECRET))!);
    adminClient.rpc.mockRejectedValue(new Error('ECONNRESET'));
    const res = await voteForOption(OPT, POLL);
    expect(res).toMatchObject({ success: false });
    expect(JSON.stringify(res)).not.toMatch(/ECONNRESET/);
  });

  it('rejects malformed ids before touching the database', async () => {
    expect((await voteForOption('x', POLL)).success).toBe(false);
    expect((await voteForOption(OPT, "' or 1=1 --")).success).toBe(false);
    expect(adminClient.rpc).not.toHaveBeenCalled();
  });

  describe('abuse controls', () => {
    const signedCookie = async () => jar.set(VOTER_COOKIE, (await signVoterCookie(SECRET))!);

    it('rate limits by client ip before anything else is recorded', async () => {
      await signedCookie();
      withinRateLimit.mockResolvedValue(false);
      const res = await voteForOption(OPT, POLL, 'tok');
      expect(res).toEqual({
        success: false,
        error: 'Too many attempts. Please wait a few minutes and try again.',
        code: 'rate_limited',
      });
      expect(adminClient.rpc).not.toHaveBeenCalled();
      expect(verifyCaptcha).not.toHaveBeenCalled();
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it('passes the vote action and the client ip to the limiter', async () => {
      await signedCookie();
      adminClient.rpc.mockResolvedValue({ data: 'v', error: null });
      await voteForOption(OPT, POLL);
      expect(withinRateLimit).toHaveBeenCalledWith('vote', '203.0.113.9');
    });

    it('does not rate limit malformed ids or a missing service role (rejected earlier)', async () => {
      await voteForOption('x', POLL);
      adminAvailable = false;
      await voteForOption(OPT, POLL);
      expect(withinRateLimit).not.toHaveBeenCalled();
    });

    it('rejects a failed captcha and records nothing', async () => {
      await signedCookie();
      verifyCaptcha.mockResolvedValue(false);
      const res = await voteForOption(OPT, POLL, 'bad');
      expect(res).toEqual({ success: false, error: 'Please complete the verification and try again.', code: 'captcha_failed' });
      expect(adminClient.rpc).not.toHaveBeenCalled();
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it('verifies the token with the client ip, and a missing token is passed through for the verifier to judge', async () => {
      await signedCookie();
      adminClient.rpc.mockResolvedValue({ data: 'v', error: null });
      await voteForOption(OPT, POLL, 'good-token');
      expect(verifyCaptcha).toHaveBeenLastCalledWith('good-token', '203.0.113.9');
      await voteForOption(OPT, POLL);
      expect(verifyCaptcha).toHaveBeenLastCalledWith(undefined, '203.0.113.9');
    });

    it('records the vote when the captcha passes', async () => {
      await signedCookie();
      adminClient.rpc.mockResolvedValue({ data: 'v9', error: null });
      expect(await voteForOption(OPT, POLL, 'good')).toEqual({ success: true, voteId: 'v9' });
    });

    it('checks the captcha before the voter cookie, so bots learn nothing about cookie state', async () => {
      verifyCaptcha.mockResolvedValue(false);
      const res = await voteForOption(OPT, POLL, 'bad');
      expect(res).toMatchObject({ code: 'captcha_failed' });
    });

    it('maps a closed poll (VT009) to code closed and refreshes the page cache', async () => {
      await signedCookie();
      adminClient.rpc.mockResolvedValue({ data: null, error: { code: 'VT009', message: 'POLL_CLOSED' } });
      const res = await voteForOption(OPT, POLL);
      expect(res).toEqual({ success: false, error: 'Voting on this poll has closed.', code: 'closed' });
      expect(revalidatePath).toHaveBeenCalledWith(`/polls/${POLL}`);
    });

    it('maps a login-only poll (VT010) to code login_required', async () => {
      await signedCookie();
      userClient.auth.getUser.mockResolvedValue({ data: { user: null } });
      adminClient.rpc.mockResolvedValue({ data: null, error: { code: 'VT010', message: 'LOGIN_REQUIRED' } });
      const res = await voteForOption(OPT, POLL);
      expect(res).toEqual({ success: false, error: 'You need to sign in to vote on this poll.', code: 'login_required' });
      expect(adminClient.rpc.mock.calls[0][1].p_user_id).toBeNull();
    });

    it('passes the verified account id to cast_vote for a signed-in voter', async () => {
      await signedCookie();
      adminClient.rpc.mockResolvedValue({ data: 'v', error: null });
      await voteForOption(OPT, POLL);
      expect(adminClient.rpc.mock.calls[0][1].p_user_id).toBe(USER);
    });

    it('keeps VT002 as already_voted for login-only duplicates', async () => {
      await signedCookie();
      adminClient.rpc.mockResolvedValue({ data: null, error: { code: 'VT002', message: 'ALREADY_VOTED' } });
      expect(await voteForOption(OPT, POLL)).toMatchObject({ code: 'already_voted' });
    });
  });

  it('fails clearly, not silently, when the service role key is not configured', async () => {
    adminAvailable = false;
    const res = await voteForOption(OPT, POLL);
    expect(res).toEqual({ success: false, error: 'Voting is not available right now. Please try again later.' });
    expect(adminClient.rpc).not.toHaveBeenCalled();
  });
});

function pollForm(extra: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set('title', 'Lunch?');
  fd.set('description', 'where');
  fd.set('option-0', 'Pizza');
  fd.set('option-1', 'Tacos');
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return fd;
}

describe('createPoll', () => {
  beforeEach(() => {
    // The rate limiter talks to the admin client; default to "within budget".
    adminClient.rpc.mockReset();
    adminClient.rpc.mockResolvedValue({ data: true, error: null });
  });

  it('creates via the atomic RPC and redirects to the poll page', async () => {
    userClient.rpc.mockResolvedValue({ data: POLL, error: null });
    await expect(createPoll(pollForm())).rejects.toMatchObject({ redirectedTo: `/polls/${POLL}?created=1` });
    expect(userClient.rpc).toHaveBeenCalledWith('create_poll_with_options', {
      p_title: 'Lunch?',
      p_description: 'where',
      p_options: ['Pizza', 'Tacos'],
      p_closes_at: null,
      p_require_login: false,
      p_results_visibility: 'always',
    });
    expect(revalidatePath).toHaveBeenCalledWith('/polls');
  });

  it('passes closing time, login requirement and result visibility to the RPC', async () => {
    userClient.rpc.mockResolvedValue({ data: POLL, error: null });
    const closes = new Date(Date.now() + 86_400_000).toISOString();
    await expect(
      createPoll(pollForm({ closes_at: closes, require_login: 'on', results_visibility: 'after_close' })),
    ).rejects.toMatchObject({ redirectedTo: `/polls/${POLL}?created=1` });
    expect(userClient.rpc.mock.calls[0][1]).toMatchObject({
      p_closes_at: closes,
      p_require_login: true,
      p_results_visibility: 'after_close',
    });
  });

  it('rejects a closing time in the past before any database call', async () => {
    const res = await createPoll(pollForm({ closes_at: new Date(Date.now() - 60_000).toISOString() }));
    expect(res).toEqual({ success: false, error: 'The closing time must be in the future' });
    expect(userClient.rpc).not.toHaveBeenCalled();
    expect(adminClient.rpc).not.toHaveBeenCalled();
  });

  it('rate limits per account BEFORE creating anything', async () => {
    withinRateLimit.mockResolvedValue(false);
    const res = await createPoll(pollForm());
    expect(res).toEqual({
      success: false,
      error: 'Too many attempts. Please wait a few minutes and try again.',
      code: 'rate_limited',
    });
    expect(withinRateLimit).toHaveBeenCalledWith('createPoll', USER);
    expect(userClient.rpc).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('does not spend rate-limit budget on signed-out or invalid submissions', async () => {
    userClient.auth.getUser.mockResolvedValue({ data: { user: null } });
    await createPoll(pollForm());
    await createPoll(pollForm({ title: ' ' }));
    expect(withinRateLimit).not.toHaveBeenCalled();
  });

  it('maps a database rejection of the settings to a friendly message', async () => {
    userClient.rpc.mockResolvedValue({ data: null, error: { code: 'VT012', message: 'INVALID_SETTINGS' } });
    expect(await createPoll(pollForm())).toEqual({
      success: false,
      error: 'Check the poll settings: the closing time must be in the future.',
    });
  });

  it('refuses signed-out users without calling the database', async () => {
    userClient.auth.getUser.mockResolvedValue({ data: { user: null } });
    expect(await createPoll(pollForm())).toMatchObject({ success: false, code: 'not_authenticated' });
    expect(userClient.rpc).not.toHaveBeenCalled();
  });

  it('returns validation errors instead of throwing', async () => {
    expect(await createPoll(pollForm({ title: '   ' }))).toEqual({ success: false, error: 'Title is required' });
    expect(userClient.rpc).not.toHaveBeenCalled();
  });

  it('returns a generic message when the database fails', async () => {
    userClient.rpc.mockResolvedValue({ data: null, error: { code: '08006', message: 'connection to 10.0.0.5 failed' } });
    const res = await createPoll(pollForm());
    expect(res.success).toBe(false);
    expect(JSON.stringify(res)).not.toMatch(/10\.0\.0\.5/);
  });
});

function ownedChain(result: { data: unknown; error: unknown }) {
  const chain: any = {
    delete: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockResolvedValue(result),
  };
  userClient.from.mockReturnValue(chain);
  return chain;
}

describe('deletePollAction', () => {
  it('deletes only a poll owned by the verified user', async () => {
    const chain = ownedChain({ data: [{ id: POLL }], error: null });
    expect(await deletePollAction(POLL)).toEqual({ success: true });
    expect(chain.eq).toHaveBeenCalledWith('id', POLL);
    expect(chain.eq).toHaveBeenCalledWith('created_by', USER);
    expect(revalidatePath).toHaveBeenCalledWith('/polls');
  });

  it('reports failure when nothing was deleted (not the owner, or already gone)', async () => {
    ownedChain({ data: [], error: null });
    expect(await deletePollAction(POLL)).toEqual({ success: false, error: 'Poll not found, or you do not own it.' });
  });

  it('reports database errors without leaking them', async () => {
    ownedChain({ data: null, error: { code: 'XX', message: 'secret detail' } });
    const res = await deletePollAction(POLL);
    expect(res.success).toBe(false);
    expect(JSON.stringify(res)).not.toMatch(/secret detail/);
  });

  it('requires sign-in and a valid id', async () => {
    userClient.auth.getUser.mockResolvedValue({ data: { user: null } });
    expect(await deletePollAction(POLL)).toMatchObject({ success: false, code: 'not_authenticated' });
    expect((await deletePollAction('nope')).success).toBe(false);
    expect(userClient.from).not.toHaveBeenCalled();
  });
});

describe('updatePollAction', () => {
  const form = (o: Record<string, string> = {}) => {
    const fd = new FormData();
    fd.set('id', POLL);
    fd.set('title', ' New title ');
    fd.set('description', ' d ');
    for (const [k, v] of Object.entries(o)) fd.set(k, v);
    return fd;
  };

  it('updates trimmed fields for the owner only', async () => {
    const chain = ownedChain({ data: [{ id: POLL }], error: null });
    expect(await updatePollAction(form())).toEqual({ success: true });
    expect(chain.update).toHaveBeenCalledWith({ title: 'New title', description: 'd' });
    expect(chain.eq).toHaveBeenCalledWith('created_by', USER);
    expect(revalidatePath).toHaveBeenCalledWith(`/polls/${POLL}`);
  });

  it('fails visibly when no row matched', async () => {
    ownedChain({ data: [], error: null });
    expect(await updatePollAction(form())).toEqual({ success: false, error: 'Poll not found, or you do not own it.' });
  });

  it('validates title and sign-in before the database', async () => {
    expect(await updatePollAction(form({ title: '  ' }))).toEqual({ success: false, error: 'Title is required' });
    userClient.auth.getUser.mockResolvedValue({ data: { user: null } });
    expect(await updatePollAction(form())).toMatchObject({ code: 'not_authenticated' });
    expect(userClient.from).not.toHaveBeenCalled();
  });
});
