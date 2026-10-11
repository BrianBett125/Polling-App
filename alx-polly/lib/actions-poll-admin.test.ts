import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const userClient: any = { rpc: vi.fn(), from: vi.fn(), auth: { getUser: vi.fn() } };
vi.mock('./supabase-server', () => ({
  getServerSupabase: vi.fn(async () => userClient),
  getCurrentUser: vi.fn(async (s: any) => (await s.auth.getUser()).data.user ?? null),
}));

import {
  closePollAction,
  reopenPollAction,
  replacePollOptionsAction,
  updatePollSettingsAction,
} from './actions-poll-admin';
import { revalidatePath } from 'next/cache';

const POLL = '11111111-1111-4111-8111-111111111111';
const USER = '33333333-3333-4333-8333-333333333333';

/** Chain for `.update(...).eq().eq().select()`; records every call. */
function updateChain(result: { data: unknown; error: unknown }) {
  const chain: any = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockResolvedValue(result),
  };
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  userClient.rpc.mockReset();
  userClient.from.mockReset();
  userClient.auth.getUser.mockReset();
  userClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER } } });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe.each([
  ['closePollAction', () => closePollAction(POLL)],
  ['reopenPollAction', () => reopenPollAction(POLL)],
  ['updatePollSettingsAction', () => updatePollSettingsAction(POLL, { requireLogin: false, resultsVisibility: 'always' })],
  ['replacePollOptionsAction', () => replacePollOptionsAction(POLL, ['a', 'b'])],
])('%s guards', (_name, run) => {
  it('refuses signed-out users without touching the database', async () => {
    userClient.auth.getUser.mockResolvedValue({ data: { user: null } });
    expect(await run()).toMatchObject({ success: false, code: 'not_authenticated' });
    expect(userClient.from).not.toHaveBeenCalled();
    expect(userClient.rpc).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe('malformed ids', () => {
  it('are rejected before anything else', async () => {
    for (const bad of ['', 'nope', "' or 1=1 --", '../x']) {
      expect((await closePollAction(bad)).success).toBe(false);
      expect((await reopenPollAction(bad)).success).toBe(false);
      expect((await updatePollSettingsAction(bad, { requireLogin: false, resultsVisibility: 'always' })).success).toBe(false);
      expect((await replacePollOptionsAction(bad, ['a', 'b'])).success).toBe(false);
    }
    expect(userClient.auth.getUser).not.toHaveBeenCalled();
  });
});

describe('closePollAction', () => {
  it('sets closed_at for the verified owner only and revalidates', async () => {
    const chain = updateChain({ data: [{ id: POLL }], error: null });
    userClient.from.mockReturnValue(chain);
    expect(await closePollAction(POLL)).toEqual({ success: true });
    expect(userClient.from).toHaveBeenCalledWith('polls');
    const patch = chain.update.mock.calls[0][0];
    expect(Number.isNaN(Date.parse(patch.closed_at))).toBe(false);
    expect(chain.eq).toHaveBeenCalledWith('id', POLL);
    expect(chain.eq).toHaveBeenCalledWith('created_by', USER);
    expect(revalidatePath).toHaveBeenCalledWith('/polls');
    expect(revalidatePath).toHaveBeenCalledWith(`/polls/${POLL}`);
  });

  it('fails when nobody owned that poll (no rows updated)', async () => {
    userClient.from.mockReturnValue(updateChain({ data: [], error: null }));
    expect(await closePollAction(POLL)).toEqual({ success: false, error: 'Poll not found, or you do not own it.' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('hides raw database errors', async () => {
    userClient.from.mockReturnValue(updateChain({ data: null, error: { code: 'XX', message: 'secret 10.0.0.5' } }));
    const res = await closePollAction(POLL);
    expect(res.success).toBe(false);
    expect(JSON.stringify(res)).not.toMatch(/secret|10\.0\.0\.5/);
  });
});

describe('reopenPollAction', () => {
  function reopenClients(closesAt: string | null, updateResult: { data: unknown; error: unknown } = { data: [{ id: POLL }], error: null }) {
    const read: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { closes_at: closesAt }, error: null }),
    };
    const write = updateChain(updateResult);
    userClient.from.mockReturnValueOnce(read).mockReturnValueOnce(write);
    return { read, write };
  }

  it('clears only closed_at when there is no closing time', async () => {
    const { read, write } = reopenClients(null);
    expect(await reopenPollAction(POLL)).toEqual({ success: true });
    expect(read.eq).toHaveBeenCalledWith('created_by', USER);
    expect(write.update).toHaveBeenCalledWith({ closed_at: null });
    expect(write.eq).toHaveBeenCalledWith('created_by', USER);
  });

  it('also clears a closing time that has passed, or the poll would stay closed', async () => {
    const { write } = reopenClients(new Date(Date.now() - 3600_000).toISOString());
    expect(await reopenPollAction(POLL)).toEqual({ success: true });
    expect(write.update).toHaveBeenCalledWith({ closed_at: null, closes_at: null });
  });

  it('keeps a closing time that is still in the future', async () => {
    const { write } = reopenClients(new Date(Date.now() + 3600_000).toISOString());
    await reopenPollAction(POLL);
    expect(write.update).toHaveBeenCalledWith({ closed_at: null });
  });

  it('reports not found when the owner filter matches nothing on read', async () => {
    const read: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    userClient.from.mockReturnValue(read);
    expect(await reopenPollAction(POLL)).toEqual({ success: false, error: 'Poll not found, or you do not own it.' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('reports not found when the update touches no rows (deleted in between)', async () => {
    reopenClients(null, { data: [], error: null });
    expect(await reopenPollAction(POLL)).toMatchObject({ success: false, error: 'Poll not found, or you do not own it.' });
  });

  it('hides raw database errors on write and on read', async () => {
    reopenClients(null, { data: null, error: { code: 'XX', message: 'secret' } });
    const res = await reopenPollAction(POLL);
    expect(res.success).toBe(false);
    expect(JSON.stringify(res)).not.toMatch(/secret/);

    const read: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { code: 'XX', message: 'secret' } }),
    };
    userClient.from.mockReset();
    userClient.from.mockReturnValue(read);
    const res2 = await reopenPollAction(POLL);
    expect(res2.success).toBe(false);
    expect(JSON.stringify(res2)).not.toMatch(/secret/);
  });
});

describe('updatePollSettingsAction', () => {
  const future = () => new Date(Date.now() + 86_400_000).toISOString();

  it('writes all three settings for the owner', async () => {
    const chain = updateChain({ data: [{ id: POLL }], error: null });
    userClient.from.mockReturnValue(chain);
    const closes = future();
    const res = await updatePollSettingsAction(POLL, { closesAt: closes, requireLogin: true, resultsVisibility: 'after_close' });
    expect(res).toEqual({ success: true });
    expect(chain.update).toHaveBeenCalledWith({ closes_at: closes, require_login: true, results_visibility: 'after_close' });
    expect(chain.eq).toHaveBeenCalledWith('created_by', USER);
    expect(revalidatePath).toHaveBeenCalledWith(`/polls/${POLL}`);
  });

  it('removes the closing time when given null', async () => {
    const chain = updateChain({ data: [{ id: POLL }], error: null });
    userClient.from.mockReturnValue(chain);
    await updatePollSettingsAction(POLL, { closesAt: null, requireLogin: false, resultsVisibility: 'always' });
    expect(chain.update).toHaveBeenCalledWith({ closes_at: null, require_login: false, results_visibility: 'always' });
  });

  it('leaves the stored closing time alone when closesAt is omitted', async () => {
    const chain = updateChain({ data: [{ id: POLL }], error: null });
    userClient.from.mockReturnValue(chain);
    await updatePollSettingsAction(POLL, { requireLogin: false, resultsVisibility: 'always' });
    expect(chain.update.mock.calls[0][0]).not.toHaveProperty('closes_at');
  });

  it('rejects a past closing time and a bad visibility before the database', async () => {
    expect(
      await updatePollSettingsAction(POLL, { closesAt: new Date(Date.now() - 1000).toISOString(), requireLogin: false, resultsVisibility: 'always' }),
    ).toEqual({ success: false, error: 'The closing time must be in the future' });
    expect(
      (await updatePollSettingsAction(POLL, { requireLogin: false, resultsVisibility: 'never' as any })).success,
    ).toBe(false);
    expect(userClient.from).not.toHaveBeenCalled();
  });

  it('reports not found for someone else\'s poll', async () => {
    userClient.from.mockReturnValue(updateChain({ data: [], error: null }));
    expect(await updatePollSettingsAction(POLL, { requireLogin: true, resultsVisibility: 'always' })).toEqual({
      success: false,
      error: 'Poll not found, or you do not own it.',
    });
  });

  it('maps a database settings rejection and hides unknown errors', async () => {
    userClient.from.mockReturnValue(updateChain({ data: null, error: { code: 'VT012', message: 'x' } }));
    expect(await updatePollSettingsAction(POLL, { requireLogin: true, resultsVisibility: 'always' })).toEqual({
      success: false,
      error: 'Check the poll settings: the closing time must be in the future.',
    });
    userClient.from.mockReturnValue(updateChain({ data: null, error: { code: 'XX', message: 'secret' } }));
    const res = await updatePollSettingsAction(POLL, { requireLogin: true, resultsVisibility: 'always' });
    expect(JSON.stringify(res)).not.toMatch(/secret/);
  });
});

describe('replacePollOptionsAction', () => {
  it('trims, drops blanks and calls the RPC in order', async () => {
    userClient.rpc.mockResolvedValue({ data: null, error: null });
    expect(await replacePollOptionsAction(POLL, [' B ', '', 'A', '  ', 'C'])).toEqual({ success: true });
    expect(userClient.rpc).toHaveBeenCalledWith('replace_poll_options', { p_poll_id: POLL, p_options: ['B', 'A', 'C'] });
    expect(revalidatePath).toHaveBeenCalledWith(`/polls/${POLL}`);
    expect(revalidatePath).toHaveBeenCalledWith('/polls');
  });

  it.each([
    ['one option', ['a'], 'At least two options are required'],
    ['duplicates', ['Yes', ' yes'], 'Options must be different from each other'],
    ['too long', ['a', 'x'.repeat(201)], 'Each option must be at most 200 characters'],
    ['too many', Array.from({ length: 21 }, (_, i) => `o${i}`), 'At most 20 options are allowed'],
  ])('rejects %s before the database', async (_n, options, error) => {
    expect(await replacePollOptionsAction(POLL, options)).toEqual({ success: false, error });
    expect(userClient.rpc).not.toHaveBeenCalled();
  });

  it('rejects non-array input and ignores non-string entries', async () => {
    expect((await replacePollOptionsAction(POLL, 'a,b' as any)).success).toBe(false);
    expect((await replacePollOptionsAction(POLL, [1, null, 'a'] as any)).success).toBe(false);
    expect(userClient.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['VT008', 'Options cannot be changed after voting has started.'],
    ['VT011', 'Only the poll owner can do that.'],
    ['VT007', 'A poll needs between 2 and 20 options, each up to 200 characters.'],
    ['VT005', 'Please sign in to create a poll.'],
  ])('maps database code %s', async (code, message) => {
    userClient.rpc.mockResolvedValue({ data: null, error: { code, message: 'raw' } });
    expect(await replacePollOptionsAction(POLL, ['a', 'b'])).toEqual({ success: false, error: message });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('hides unknown database errors', async () => {
    userClient.rpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'relation poll_options at 10.0.0.5' } });
    const res = await replacePollOptionsAction(POLL, ['a', 'b']);
    expect(res.success).toBe(false);
    expect(JSON.stringify(res)).not.toMatch(/poll_options|10\.0\.0\.5/);
  });
});
