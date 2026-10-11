import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const userClient: any = { auth: { getUser: vi.fn(), signOut: vi.fn() } };
const adminClient: any = { auth: { admin: { deleteUser: vi.fn() } }, from: vi.fn() };
let adminAvailable = true;
vi.mock('./supabase-server', () => ({
  getServerSupabase: vi.fn(async () => userClient),
  getAdminSupabase: vi.fn(() => (adminAvailable ? adminClient : null)),
  getCurrentUser: vi.fn(async (s: any) => (await s.auth.getUser()).data.user ?? null),
}));

let allowed = true;
vi.mock('./rate-limit', () => ({
  withinRateLimit: vi.fn(async () => allowed),
  RATE_LIMITED_MESSAGE: 'Too many attempts. Please wait a few minutes and try again.',
}));

import { deleteAccountAction } from './actions-account';
import { revalidatePath } from 'next/cache';
import { withinRateLimit } from './rate-limit';

const recent = () => new Date(Date.now() - 60_000).toISOString();
const USER = { id: '33333333-3333-4333-8333-333333333333', email: 'Ann@Example.com', last_sign_in_at: recent() };

beforeEach(() => {
  vi.clearAllMocks();
  adminAvailable = true;
  allowed = true;
  userClient.auth.getUser.mockResolvedValue({ data: { user: { ...USER, last_sign_in_at: recent() } } });
  userClient.auth.signOut.mockResolvedValue({ error: null });
  adminClient.auth.admin.deleteUser.mockResolvedValue({ error: null });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('deleteAccountAction', () => {
  it('rejects a visitor who is not signed in and touches nothing', async () => {
    userClient.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await deleteAccountAction('ann@example.com');
    expect(res).toMatchObject({ success: false, code: 'not_authenticated' });
    expect(adminClient.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it('asks for a fresh sign-in when the last one was over 15 minutes ago, before anything else', async () => {
    const old = new Date(Date.now() - 16 * 60_000).toISOString();
    userClient.auth.getUser.mockResolvedValue({ data: { user: { ...USER, last_sign_in_at: old } } });
    const res = await deleteAccountAction('ann@example.com');
    expect(res).toMatchObject({ success: false, code: 'reauth_required' });
    expect(withinRateLimit).not.toHaveBeenCalled();
    expect(adminClient.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it('treats a missing or unparseable last_sign_in_at as not recent', async () => {
    for (const v of [undefined, null, 'garbage']) {
      userClient.auth.getUser.mockResolvedValue({ data: { user: { ...USER, last_sign_in_at: v } } });
      expect(await deleteAccountAction('ann@example.com')).toMatchObject({ code: 'reauth_required' });
    }
    expect(adminClient.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it('rejects a wrong confirmation email on the server', async () => {
    const res = await deleteAccountAction('someone@else.com');
    expect(res).toMatchObject({ success: false });
    expect((res as { error: string }).error).toMatch(/does not match/i);
    expect(adminClient.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it('rejects empty and non-string confirmations', async () => {
    expect((await deleteAccountAction('')).success).toBe(false);
    expect((await deleteAccountAction(undefined as unknown as string)).success).toBe(false);
    expect((await deleteAccountAction(null as unknown as string)).success).toBe(false);
    expect(adminClient.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it('is rate limited per user id', async () => {
    allowed = false;
    const res = await deleteAccountAction('ann@example.com');
    expect(withinRateLimit).toHaveBeenCalledWith('deleteAccount', USER.id);
    expect(res).toEqual({
      success: false,
      error: 'Too many attempts. Please wait a few minutes and try again.',
      code: 'rate_limited',
    });
    expect(adminClient.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it('fails with a friendly message when the service role key is missing', async () => {
    adminAvailable = false;
    const res = await deleteAccountAction('ann@example.com');
    expect(res.success).toBe(false);
    expect((res as { error: string }).error).toMatch(/not available/i);
    expect(userClient.auth.signOut).not.toHaveBeenCalled();
  });

  it('reports a delete failure without leaking backend text and keeps the session', async () => {
    adminClient.auth.admin.deleteUser.mockResolvedValue({ error: { code: 'unexpected_failure', status: 500, message: 'pg secret detail' } });
    const res = await deleteAccountAction('ann@example.com');
    expect(res.success).toBe(false);
    expect(JSON.stringify(res)).not.toMatch(/pg secret/);
    expect(userClient.auth.signOut).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('deletes only the verified user, never by hand, signs out and revalidates', async () => {
    const res = await deleteAccountAction('  ANN@example.COM ');
    expect(res).toEqual({ success: true });
    expect(adminClient.auth.admin.deleteUser).toHaveBeenCalledWith(USER.id);
    expect(adminClient.from).not.toHaveBeenCalled();
    expect(userClient.auth.signOut).toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith('/polls');
  });

  it('still succeeds if sign-out throws after the user is deleted', async () => {
    userClient.auth.signOut.mockRejectedValue(new Error('boom'));
    expect(await deleteAccountAction('ann@example.com')).toEqual({ success: true });
  });
});
