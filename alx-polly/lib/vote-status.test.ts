import { beforeEach, describe, expect, it, vi } from 'vitest';

const jar = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n)! } : undefined) })),
}));

// Tables answer from a script; every query records its filters.
type Result = { data: unknown; error: unknown };
const answers: Record<string, Result[]> = {};
const queries: { table: string; filters: Record<string, unknown> }[] = [];
const admin = {
  from: (table: string) => {
    const q = { table, filters: {} as Record<string, unknown> };
    queries.push(q);
    const b: any = {
      select: () => b,
      limit: () => b,
      eq: (k: string, v: unknown) => ((q.filters[k] = v), b),
      maybeSingle: async () => answers[table]?.shift() ?? { data: null, error: null },
    };
    return b;
  },
};
let adminAvailable = true;
let userId: string | null = null;
let authThrows = false;
vi.mock('./supabase-server', () => ({
  getAdminSupabase: vi.fn(() => (adminAvailable ? admin : null)),
  getServerSupabase: vi.fn(async () => ({})),
  getCurrentUser: vi.fn(async () => {
    if (authThrows) throw new Error('auth down');
    return userId ? { id: userId } : null;
  }),
}));

import { getVoteStatus } from './vote-status';
import { VOTER_COOKIE, signVoterCookie } from './voter';

const POLL = '11111111-1111-4111-8111-111111111111';
const USER = '33333333-3333-4333-8333-333333333333';
const SECRET = 'cd'.repeat(32);

beforeEach(() => {
  jar.clear();
  queries.length = 0;
  for (const k of Object.keys(answers)) delete answers[k];
  adminAvailable = true;
  userId = null;
  authThrows = false;
  process.env.VOTER_COOKIE_SECRET = 'unit-test-signing-key';
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('getVoteStatus', () => {
  it('returns not voted without a cookie or a session, and never queries', async () => {
    expect(await getVoteStatus(POLL)).toEqual({ hasVoted: false, optionId: null });
    expect(queries).toHaveLength(0);
  });

  it('finds the vote by cookie token', async () => {
    jar.set(VOTER_COOKIE, (await signVoterCookie(SECRET))!);
    answers.votes = [{ data: { option_id: 'o1' }, error: null }];
    expect(await getVoteStatus(POLL)).toEqual({ hasVoted: true, optionId: 'o1' });
    expect(queries[0].filters).toHaveProperty('voter_token');
  });

  it('finds an account vote made from another browser on a login-only poll', async () => {
    userId = USER;
    answers.polls = [{ data: { require_login: true }, error: null }];
    answers.votes = [{ data: { option_id: 'o2' }, error: null }];
    expect(await getVoteStatus(POLL)).toEqual({ hasVoted: true, optionId: 'o2' });
    const voteQuery = queries.find((q) => q.table === 'votes')!;
    expect(voteQuery.filters).toEqual({ poll_id: POLL, user_id: USER });
  });

  it('ignores account votes on ordinary polls (cookie rules apply)', async () => {
    userId = USER;
    answers.polls = [{ data: { require_login: false }, error: null }];
    answers.votes = [{ data: { option_id: 'o2' }, error: null }];
    expect(await getVoteStatus(POLL)).toEqual({ hasVoted: false, optionId: null });
    expect(queries.some((q) => q.table === 'votes')).toBe(false);
  });

  it('a signed-in viewer on a login-only poll with no vote is not voted', async () => {
    userId = USER;
    answers.polls = [{ data: { require_login: true }, error: null }];
    expect(await getVoteStatus(POLL)).toEqual({ hasVoted: false, optionId: null });
  });

  it('treats an auth failure as signed out', async () => {
    authThrows = true;
    expect(await getVoteStatus(POLL)).toEqual({ hasVoted: false, optionId: null });
    expect(queries).toHaveLength(0);
  });

  it('falls through to the account check when the cookie lookup errors', async () => {
    jar.set(VOTER_COOKIE, (await signVoterCookie(SECRET))!);
    userId = USER;
    answers.votes = [
      { data: null, error: { code: 'XX000' } },
      { data: { option_id: 'o3' }, error: null },
    ];
    answers.polls = [{ data: { require_login: true }, error: null }];
    expect(await getVoteStatus(POLL)).toEqual({ hasVoted: true, optionId: 'o3' });
  });

  it('answers not voted on database errors', async () => {
    userId = USER;
    answers.polls = [{ data: null, error: { code: 'XX000' } }];
    expect(await getVoteStatus(POLL)).toEqual({ hasVoted: false, optionId: null });
    answers.polls = [{ data: { require_login: true }, error: null }];
    answers.votes = [{ data: null, error: { code: 'XX000' } }];
    expect(await getVoteStatus(POLL)).toEqual({ hasVoted: false, optionId: null });
  });

  it('returns not voted when the service role is not configured', async () => {
    adminAvailable = false;
    userId = USER;
    expect(await getVoteStatus(POLL)).toEqual({ hasVoted: false, optionId: null });
  });
});
