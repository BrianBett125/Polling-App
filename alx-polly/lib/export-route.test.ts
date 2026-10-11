import { beforeEach, describe, expect, it, vi } from 'vitest';

const client: any = { rpc: vi.fn(), auth: { getUser: vi.fn() } };
vi.mock('./supabase-server', () => ({
  getComponentSupabase: vi.fn(async () => client),
  getCurrentUser: vi.fn(async (s: any) => (await s.auth.getUser()).data.user ?? null),
}));

import { GET } from '../app/polls/[id]/export/route';

const POLL = '11111111-1111-4111-8111-111111111111';
const USER = '33333333-3333-4333-8333-333333333333';
const call = (id = POLL) => GET(new Request(`http://x/polls/${id}/export`), { params: Promise.resolve({ id }) });

const ownerPoll = (over: Record<string, unknown> = {}) => ({
  id: POLL,
  title: 'Lunch, "team" =1+1',
  description: null,
  created_by: USER,
  created_at: '2030-01-01T00:00:00Z',
  closes_at: null,
  closed_at: null,
  is_closed: false,
  require_login: false,
  results_visibility: 'always',
  results_hidden: false,
  is_owner: true,
  options: [
    { id: 'b', text: 'Tacos', position: 1, created_at: '2030-01-01T00:00:00Z', votes: 1 },
    { id: 'a', text: '-Pizza', position: 0, created_at: '2030-01-01T00:00:00Z', votes: 3 },
  ],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  client.auth.getUser.mockResolvedValue({ data: { user: { id: USER } } });
  client.rpc.mockResolvedValue({ data: ownerPoll(), error: null });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /polls/[id]/export', () => {
  it('returns the owner a CSV attachment with safe, ordered rows', async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="poll-lunch-team-1-1.csv"');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    const bytes = new Uint8Array(await res.clone().arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // UTF-8 BOM for Excel
    const body = await res.text(); // text() drops the BOM
    expect(body).toBe(
      [
        'Poll,"Lunch, ""team"" =1+1"',
        'Status,Open',
        'Total votes,4',
        '',
        'Option,Votes,Percent',
        "'-Pizza,3,75",
        'Tacos,1,25',
        '',
      ].join('\r\n'),
    );
  });

  it('neutralises a formula in the title', async () => {
    client.rpc.mockResolvedValue({ data: ownerPoll({ title: '=HYPERLINK("http://evil")' }), error: null });
    const body = await (await call()).text();
    expect(body).toContain(`Poll,"'=HYPERLINK(""http://evil"")"`);
  });

  it('says Closed for a closed poll', async () => {
    client.rpc.mockResolvedValue({ data: ownerPoll({ is_closed: true, closed_at: '2030-01-02T00:00:00Z' }), error: null });
    expect(await (await call()).text()).toContain('Status,Closed');
  });

  it('is 401 when signed out, without querying the poll', async () => {
    client.auth.getUser.mockResolvedValue({ data: { user: null } });
    expect((await call()).status).toBe(401);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('answers a missing poll and someone else\'s poll identically (404, same body)', async () => {
    client.rpc.mockResolvedValue({ data: null, error: null });
    const missing = await call();
    client.rpc.mockResolvedValue({ data: ownerPoll({ is_owner: false }), error: null });
    const foreign = await call();
    expect(missing.status).toBe(404);
    expect(foreign.status).toBe(404);
    expect(await foreign.text()).toBe(await missing.text());
  });

  it('never leaks counts to a non-owner', async () => {
    client.rpc.mockResolvedValue({ data: ownerPoll({ is_owner: false }), error: null });
    const body = await (await call()).text();
    expect(body).not.toMatch(/Pizza|Tacos|Total votes/);
  });

  it('404s a malformed id without any lookup', async () => {
    expect((await call('not-a-uuid')).status).toBe(404);
    expect(client.auth.getUser).not.toHaveBeenCalled();
  });

  it('returns a generic 500 on a database error', async () => {
    client.rpc.mockResolvedValue({ data: null, error: { code: 'XX', message: 'relation secret at 10.0.0.5' } });
    const res = await call();
    expect(res.status).toBe(500);
    expect(await res.text()).not.toMatch(/secret|10\.0\.0\.5/);
  });
});
