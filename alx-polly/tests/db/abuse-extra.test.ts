import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, migrateAll, token, type TestDb } from './harness';

const A = '00000000-0000-4000-8000-0000000000a1';
const B = '00000000-0000-4000-8000-0000000000b1';

let db: TestDb;

async function newPoll(owner: string, requireLogin: boolean, closesAt: string | null = null) {
  const r = await db.as('authenticated', owner, 'select public.create_poll_with_options($1,$2,$3,$4,$5,$6) as id', [
    'Q',
    null,
    ['X', 'Y'],
    closesAt,
    requireLogin,
    'always',
  ]);
  const id = r.rows[0].id as string;
  const o = await db.admin('select id from poll_options where poll_id=$1 order by position', [id]);
  return { id, opts: o.rows.map((x) => x.id as string) };
}
const vote = (poll: string, opt: string, tok: string, uid: string | null = null) =>
  db.as('service_role', null, 'select public.cast_vote($1,$2,$3,$4) as id', [poll, opt, tok, uid]);
const total = async (poll: string) => (await db.admin('select count(*)::int c from votes where poll_id=$1', [poll])).rows[0].c as number;

beforeAll(async () => {
  db = await createDb();
  await migrateAll(db);
  await db.admin('insert into auth.users(id,email) values ($1,$2),($3,$4)', [A, 'a@x.test', B, 'b@x.test']);
});
afterAll(async () => {
  await db.drop();
});

describe('closed beats login-only', () => {
  it('reports a manually closed login-only poll as closed (VT009) to anonymous visitors, not as login required', async () => {
    const p = await newPoll(A, true);
    await db.as('authenticated', A, 'update polls set closed_at = now() where id=$1', [p.id]);
    await expect(vote(p.id, p.opts[0], token('1'))).rejects.toMatchObject({ code: 'VT009' });
    await expect(vote(p.id, p.opts[0], token('1'), B)).rejects.toMatchObject({ code: 'VT009' });
    expect(await total(p.id)).toBe(0);
  });

  it('refuses votes after closes_at passes, even for a signed-in voter on a login-only poll', async () => {
    const p = await newPoll(A, true, new Date(Date.now() + 1500).toISOString());
    await vote(p.id, p.opts[0], token('2'), B);
    await new Promise((r) => setTimeout(r, 1800));
    await expect(vote(p.id, p.opts[1], token('3'), A)).rejects.toMatchObject({ code: 'VT009' });
    expect(await total(p.id)).toBe(1);
  });
});

describe('simultaneous closing and voting', () => {
  it('accepts only votes that serialise before the close, and freezes the count after it', async () => {
    const p = await newPoll(A, false);
    const votes = Array.from({ length: 10 }, (_, i) => vote(p.id, p.opts[i % 2], token(`c${i}`)).then(() => 'ok', (e) => e.code as string));
    const close = db.as('authenticated', A, 'update polls set closed_at = now() where id=$1', [p.id]);
    const outcomes = await Promise.all([...votes, close.then(() => 'closed')]);
    // Every vote either succeeded before the close or was rejected as closed; nothing else.
    expect(outcomes.filter((o) => o !== 'ok' && o !== 'closed' && o !== 'VT009')).toEqual([]);
    const stored = await total(p.id);
    expect(outcomes.filter((o) => o === 'ok')).toHaveLength(stored);
    // now() is the transaction start, so created_at cannot order commits; test the visible effect instead:
    // once the close has committed, the count is frozen.
    await expect(vote(p.id, p.opts[0], token('c99'))).rejects.toMatchObject({ code: 'VT009' });
    expect(await total(p.id)).toBe(stored);
  });
});

describe('account ids', () => {
  it('rejects a user id that does not exist instead of recording an orphan vote', async () => {
    const p = await newPoll(A, true);
    await expect(vote(p.id, p.opts[0], token('4'), '00000000-0000-4000-8000-00000000dead')).rejects.toMatchObject({ code: '23503' });
    expect(await total(p.id)).toBe(0);
  });
});
