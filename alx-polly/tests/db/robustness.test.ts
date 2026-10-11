import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, migrateAll, token, type TestDb } from './harness';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';

let db: TestDb;

type Settings = { closesAt?: string | null; requireLogin?: boolean; visibility?: 'always' | 'after_close' };

async function newPoll(owner: string, s: Settings = {}, options = ['X', 'Y']) {
  const r = await db.as(
    'authenticated',
    owner,
    'select public.create_poll_with_options($1,$2,$3,$4,$5,$6) as id',
    ['Q', null, options, s.closesAt ?? null, s.requireLogin ?? false, s.visibility ?? 'always'],
  );
  const id = r.rows[0].id as string;
  const o = await db.admin('select id from poll_options where poll_id=$1 order by position', [id]);
  return { id, opts: o.rows.map((x) => x.id as string) };
}
const vote = (poll: string, opt: string, tok: string, uid: string | null = null) =>
  db.as('service_role', null, 'select public.cast_vote($1,$2,$3,$4) as id', [poll, opt, tok, uid]);
const getPoll = async (role: 'anon' | 'authenticated', uid: string | null, id: string) =>
  (await db.as(role, uid, 'select public.get_poll($1) as p', [id])).rows[0].p;

beforeAll(async () => {
  db = await createDb();
  await migrateAll(db);
  await db.admin('insert into auth.users(id,email) values ($1,$2),($3,$4)', [A, 'a@x.test', B, 'b@x.test']);
});
afterAll(async () => {
  await db.drop();
});

describe('poll settings on creation', () => {
  it('stores closes_at, require_login and results_visibility', async () => {
    const future = new Date(Date.now() + 3600_000).toISOString();
    const p = await newPoll(A, { closesAt: future, requireLogin: true, visibility: 'after_close' });
    const g = await getPoll('anon', null, p.id);
    expect(g).toMatchObject({ require_login: true, results_visibility: 'after_close', is_closed: false });
    expect(new Date(g.closes_at).toISOString()).toBe(future);
  });

  it('refuses a closing time in the past and unknown visibility values', async () => {
    await expect(newPoll(A, { closesAt: new Date(Date.now() - 1000).toISOString() })).rejects.toMatchObject({ code: 'VT012' });
    await expect(newPoll(A, { visibility: 'nope' as never })).rejects.toMatchObject({ code: 'VT012' });
  });

  it('defaults to an open, public-results poll', async () => {
    const p = await newPoll(A);
    expect(await getPoll('anon', null, p.id)).toMatchObject({
      require_login: false,
      results_visibility: 'always',
      is_closed: false,
      closes_at: null,
      closed_at: null,
    });
  });
});

describe('closing', () => {
  it('rejects votes after the owner closes the poll and accepts them again when reopened', async () => {
    const p = await newPoll(A);
    await vote(p.id, p.opts[0], token('1'));
    await db.as('authenticated', A, 'update polls set closed_at = now() where id=$1', [p.id]);
    expect((await getPoll('anon', null, p.id)).is_closed).toBe(true);
    await expect(vote(p.id, p.opts[0], token('2'))).rejects.toMatchObject({ code: 'VT009', message: 'POLL_CLOSED' });
    await db.as('authenticated', A, 'update polls set closed_at = null where id=$1', [p.id]);
    await vote(p.id, p.opts[0], token('2'));
  });

  it('rejects votes once closes_at has passed', async () => {
    const p = await newPoll(A, { closesAt: new Date(Date.now() + 3600_000).toISOString() });
    await db.admin(`update polls set closes_at = now() - interval '1 second' where id=$1`, [p.id]);
    expect((await getPoll('anon', null, p.id)).is_closed).toBe(true);
    await expect(vote(p.id, p.opts[0], token('3'))).rejects.toMatchObject({ code: 'VT009' });
  });

  it('does not let another user close or reopen a poll', async () => {
    const p = await newPoll(A);
    const r = await db.as('authenticated', B, 'update polls set closed_at = now() where id=$1', [p.id]);
    expect(r.rowCount).toBe(0);
  });
});

describe('login-only polls', () => {
  it('refuses anonymous voters', async () => {
    const p = await newPoll(A, { requireLogin: true });
    await expect(vote(p.id, p.opts[0], token('4'))).rejects.toMatchObject({ code: 'VT010', message: 'LOGIN_REQUIRED' });
  });

  it('allows one vote per account even from a second browser', async () => {
    const p = await newPoll(A, { requireLogin: true });
    await vote(p.id, p.opts[0], token('5'), B);
    await expect(vote(p.id, p.opts[1], token('6'), B)).rejects.toMatchObject({ code: 'VT002' });
    await vote(p.id, p.opts[1], token('6'), A);
    const c = await db.admin('select votes::int v from poll_options where poll_id=$1 order by position', [p.id]);
    expect(c.rows.map((r) => r.v)).toEqual([1, 1]);
  });

  it('holds under simultaneous votes from one account in many browsers', async () => {
    const p = await newPoll(A, { requireLogin: true });
    const results = await Promise.allSettled(
      ['a', 'b', 'c', 'd', 'e', 'f', 'e1', 'e2'].map((c, i) => vote(p.id, p.opts[i % 2], token(c.padEnd(1, '0')[0] + String(i)), B)),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const n = await db.admin('select count(*)::int c from votes where poll_id=$1', [p.id]);
    expect(n.rows[0].c).toBe(1);
  });

  it('does not limit accounts on ordinary polls (browser rule only)', async () => {
    const p = await newPoll(A);
    await vote(p.id, p.opts[0], token('7'), B);
    await vote(p.id, p.opts[1], token('8'), B);
  });
});

describe('results visibility', () => {
  it('hides counts from everyone but the owner while open, then reveals them on close', async () => {
    const p = await newPoll(A, { visibility: 'after_close' });
    await vote(p.id, p.opts[0], token('9'));
    const anon = await getPoll('anon', null, p.id);
    expect(anon.results_hidden).toBe(true);
    expect(anon.options.map((o: { votes: unknown }) => o.votes)).toEqual([null, null]);
    expect((await getPoll('authenticated', B, p.id)).results_hidden).toBe(true);
    const owner = await getPoll('authenticated', A, p.id);
    expect(owner.results_hidden).toBe(false);
    expect(owner.options.map((o: { votes: number }) => o.votes)).toEqual([1, 0]);

    await db.as('authenticated', A, 'update polls set closed_at = now() where id=$1', [p.id]);
    const after = await getPoll('anon', null, p.id);
    expect(after.results_hidden).toBe(false);
    expect(after.options.map((o: { votes: number }) => o.votes)).toEqual([1, 0]);
  });

  it('get_poll returns null for an unknown id and never exposes voter tokens', async () => {
    expect(await getPoll('anon', null, '11111111-1111-4111-8111-111111111111')).toBeNull();
    const p = await newPoll(A);
    await vote(p.id, p.opts[0], token('b'));
    expect(JSON.stringify(await getPoll('anon', null, p.id))).not.toContain(token('b'));
  });
});

describe('replace_poll_options', () => {
  const replace = (uid: string | null, id: string, opts: string[]) =>
    db.as(uid ? 'authenticated' : 'anon', uid, 'select public.replace_poll_options($1,$2)', [id, opts]);

  it('lets the owner rewrite options before any vote, keeping order', async () => {
    const p = await newPoll(A);
    await replace(A, p.id, ['One', ' Two ', '', 'Three']);
    const g = await getPoll('anon', null, p.id);
    expect(g.options.map((o: { text: string }) => o.text)).toEqual(['One', 'Two', 'Three']);
    expect(g.options.map((o: { position: number }) => o.position)).toEqual([0, 1, 2]);
  });

  it('refuses after the first vote, for non-owners, anonymous callers and bad input', async () => {
    const p = await newPoll(A);
    await expect(replace(B, p.id, ['a', 'b'])).rejects.toMatchObject({ code: 'VT011' });
    await expect(replace(null, p.id, ['a', 'b'])).rejects.toMatchObject({ code: '42501' });
    await expect(replace(A, p.id, ['only one'])).rejects.toMatchObject({ code: 'VT007' });
    await expect(replace(A, p.id, Array.from({ length: 21 }, (_, i) => `o${i}`))).rejects.toMatchObject({ code: 'VT007' });
    await expect(replace(A, p.id, ['a', 'x'.repeat(201)])).rejects.toMatchObject({ code: 'VT007' });
    await vote(p.id, p.opts[0], token('c'));
    await expect(replace(A, p.id, ['a', 'b'])).rejects.toMatchObject({ code: 'VT008', message: 'POLL_HAS_VOTES' });
    const g = await getPoll('anon', null, p.id);
    expect(g.options.map((o: { text: string }) => o.text)).toEqual(['X', 'Y']);
  });
});

describe('check_rate_limit', () => {
  const hit = (key: string, limit: number, secs: number) =>
    db.as('service_role', null, 'select public.check_rate_limit($1,$2,$3) as ok', [key, limit, secs]).then((r) => r.rows[0].ok as boolean);

  it('allows up to the limit inside a window, then refuses', async () => {
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await hit('t:limit', 3, 3600));
    expect(results).toEqual([true, true, true, false, false]);
  });

  it('counts keys separately', async () => {
    expect(await hit('t:other-a', 1, 3600)).toBe(true);
    expect(await hit('t:other-b', 1, 3600)).toBe(true);
    expect(await hit('t:other-a', 1, 3600)).toBe(false);
  });

  it('is exact under concurrency', async () => {
    const r = await Promise.all(Array.from({ length: 20 }, () => hit('t:race', 7, 3600)));
    expect(r.filter(Boolean)).toHaveLength(7);
  });

  it('is not callable by browser roles and the table is unreadable', async () => {
    await expect(db.as('anon', null, `select public.check_rate_limit('x',1,1)`)).rejects.toMatchObject({ code: '42501' });
    await expect(db.as('authenticated', A, `select public.check_rate_limit('x',1,1)`)).rejects.toMatchObject({ code: '42501' });
    await expect(db.as('anon', null, 'select * from rate_limits')).rejects.toMatchObject({ code: '42501' });
    await expect(db.as('authenticated', A, 'select * from rate_limits')).rejects.toMatchObject({ code: '42501' });
  });

  it('rejects nonsense parameters', async () => {
    await expect(db.as('service_role', null, `select public.check_rate_limit('x',0,10)`)).rejects.toMatchObject({ code: 'VT013' });
    await expect(db.as('service_role', null, `select public.check_rate_limit('x',1,0)`)).rejects.toMatchObject({ code: 'VT013' });
  });
});

describe('account deletion', () => {
  it('deleting an auth user removes their polls, options and votes, and unlinks their votes elsewhere', async () => {
    const C = '00000000-0000-4000-8000-00000000000c';
    await db.admin('insert into auth.users(id,email) values ($1,$2)', [C, 'c@x.test']);
    const mine = await newPoll(C);
    const theirs = await newPoll(A);
    await vote(mine.id, mine.opts[0], token('d'));
    await vote(theirs.id, theirs.opts[0], token('e'), C);

    await db.admin('delete from auth.users where id=$1', [C]);

    expect((await db.admin('select count(*)::int c from polls where id=$1', [mine.id])).rows[0].c).toBe(0);
    expect((await db.admin('select count(*)::int c from poll_options where poll_id=$1', [mine.id])).rows[0].c).toBe(0);
    expect((await db.admin('select count(*)::int c from votes where poll_id=$1', [mine.id])).rows[0].c).toBe(0);
    const kept = await db.admin('select user_id from votes where poll_id=$1', [theirs.id]);
    expect(kept.rows).toEqual([{ user_id: null }]);
    expect((await getPoll('anon', null, theirs.id)).options[0].votes).toBe(1);
  });
});

describe('dashboard view', () => {
  it('exposes lifecycle columns to the owner only', async () => {
    const p = await newPoll(A, { requireLogin: true });
    const r = await db.as('authenticated', A, 'select closes_at, closed_at, require_login from polls_with_totals where id=$1', [p.id]);
    expect(r.rows[0]).toEqual({ closes_at: null, closed_at: null, require_login: true });
    expect((await db.as('authenticated', B, 'select 1 from polls_with_totals where id=$1', [p.id])).rowCount).toBe(0);
  });
});
