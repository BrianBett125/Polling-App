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

import { voteForOption, createPoll, deletePollAction, updatePollAction } from './actions';
import { revalidatePath } from 'next/cache';
import { VOTER_COOKIE } from './voter';

const POLL = '11111111-1111-4111-8111-111111111111';
const OPT = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';
const SECRET = 'ab'.repeat(32);
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

beforeEach(() => {
  vi.clearAllMocks();
  jar.clear();
  adminAvailable = true;
  userClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER } } });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('voteForOption', () => {
  it('stores a hashed server-issued browser token and revalidates', async () => {
    jar.set(VOTER_COOKIE, SECRET);
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

  it('rejects a malformed cookie instead of trusting it', async () => {
    jar.set(VOTER_COOKIE, 'not-a-valid-secret');
    const res = await voteForOption(OPT, POLL);
    expect(res.success).toBe(false);
    expect(adminClient.rpc).not.toHaveBeenCalled();
  });

  it('votes anonymously when nobody is signed in or the auth lookup fails', async () => {
    jar.set(VOTER_COOKIE, SECRET);
    adminClient.rpc.mockResolvedValue({ data: 'v', error: null });
    userClient.auth.getUser.mockRejectedValue(new Error('auth down'));
    const res = await voteForOption(OPT, POLL);
    expect(res.success).toBe(true);
    expect(adminClient.rpc.mock.calls[0][1].p_user_id).toBeNull();
  });

  it('reports a duplicate vote without claiming success', async () => {
    jar.set(VOTER_COOKIE, SECRET);
    adminClient.rpc.mockResolvedValue({ data: null, error: { code: 'VT002', message: 'ALREADY_VOTED' } });
    const res = await voteForOption(OPT, POLL);
    expect(res).toEqual({ success: false, error: 'You have already voted on this poll from this browser.', code: 'already_voted' });
  });

  it.each([
    ['VT003', 'This poll no longer exists.'],
    ['VT004', 'That option is not part of this poll. Reload the page and try again.'],
  ])('maps database code %s to a friendly message', async (code, message) => {
    jar.set(VOTER_COOKIE, SECRET);
    adminClient.rpc.mockResolvedValue({ data: null, error: { code, message: 'raw' } });
    expect(await voteForOption(OPT, POLL)).toEqual({ success: false, error: message });
  });

  it('hides raw database errors from the visitor', async () => {
    jar.set(VOTER_COOKIE, SECRET);
    adminClient.rpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'relation "votes" is broken at 10.0.0.5' } });
    const res = await voteForOption(OPT, POLL);
    expect(res.success).toBe(false);
    expect(JSON.stringify(res)).not.toMatch(/votes|10\.0\.0\.5|XX000/);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('survives a thrown error (network down) with a generic failure', async () => {
    jar.set(VOTER_COOKIE, SECRET);
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
  it('creates via the atomic RPC and redirects to the poll page', async () => {
    userClient.rpc.mockResolvedValue({ data: POLL, error: null });
    await expect(createPoll(pollForm())).rejects.toMatchObject({ redirectedTo: `/polls/${POLL}?created=1` });
    expect(userClient.rpc).toHaveBeenCalledWith('create_poll_with_options', {
      p_title: 'Lunch?',
      p_description: 'where',
      p_options: ['Pizza', 'Tacos'],
    });
    expect(revalidatePath).toHaveBeenCalledWith('/polls');
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
