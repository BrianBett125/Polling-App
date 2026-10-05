import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, migrateAll, token, type TestDb } from './harness';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';

let db: TestDb;
let pollId: string;
let optX: string;
let optY: string;

async function newPoll(owner: string, title = 'Q', options = ['X', 'Y']) {
  const r = await db.as('authenticated', owner, 'select public.create_poll_with_options($1,$2,$3) as id', [title, null, options]);
  const id = r.rows[0].id as string;
  const o = await db.admin('select id from poll_options where poll_id=$1 order by position', [id]);
  return { id, opts: o.rows.map((x) => x.id as string) };
}

const vote = (poll: string, opt: string, tok: string, uid: string | null = null) =>
  db.as('service_role', null, 'select public.cast_vote($1,$2,$3,$4) as id', [poll, opt, tok, uid]);

const counts = async (poll: string) =>
  (await db.admin('select votes::int as v from poll_options where poll_id=$1 order by position', [poll])).rows.map((r) => r.v);

beforeAll(async () => {
  db = await createDb();
  await migrateAll(db);
  await db.admin('insert into auth.users(id,email) values ($1,$2),($3,$4)', [A, 'a@x.test', B, 'b@x.test']);
  const p = await newPoll(A);
  pollId = p.id;
  [optX, optY] = p.opts;
});
afterAll(async () => {
  await db.drop();
});

describe('migration runner', () => {
  it('is idempotent: a second run applies nothing', async () => {
    expect(await migrateAll(db)).toEqual([]);
  });
});

describe('cast_vote: browser-level rule', () => {
  it('records a vote and the displayed count follows the vote rows', async () => {
    await vote(pollId, optX, token('a'));
    expect(await counts(pollId)).toEqual([1, 0]);
  });

  it('rejects a second vote from the same browser token, even for another option', async () => {
    await expect(vote(pollId, optY, token('a'))).rejects.toMatchObject({ code: 'VT002', message: 'ALREADY_VOTED' });
    expect(await counts(pollId)).toEqual([1, 0]);
  });

  it('does not block other browsers (no IP identity, so shared networks are fine)', async () => {
    await vote(pollId, optY, token('b'));
    await vote(pollId, optY, token('c'));
    expect(await counts(pollId)).toEqual([1, 2]);
  });

  it('applies the limit per poll: the same browser can vote on a different poll', async () => {
    const other = await newPoll(B);
    await vote(other.id, other.opts[0], token('a'));
    expect(await counts(other.id)).toEqual([1, 0]);
  });

  it('rejects an option that belongs to another poll and records nothing', async () => {
    const other = await newPoll(B);
    await expect(vote(pollId, other.opts[0], token('d'))).rejects.toMatchObject({ code: 'VT004', message: 'INVALID_OPTION' });
    expect(await counts(other.id)).toEqual([0, 0]);
    expect((await db.admin('select count(*)::int c from votes where voter_token=$1', [token('d')])).rows[0].c).toBe(0);
  });

  it('rejects a deleted/unknown poll', async () => {
    await expect(vote('11111111-1111-4111-8111-111111111111', optX, token('e'))).rejects.toMatchObject({ code: 'VT003' });
  });

  it('rejects malformed or missing tokens', async () => {
    await expect(vote(pollId, optX, 'abc')).rejects.toMatchObject({ code: 'VT001' });
    await expect(vote(pollId, optX, token('A'))).rejects.toMatchObject({ code: 'VT001' });
    await expect(
      db.as('service_role', null, 'select public.cast_vote($1,$2,null,null)', [pollId, optX]),
    ).rejects.toMatchObject({ code: 'VT001' });
  });

  it('is race-safe: 12 concurrent submits with one token yield exactly one vote', async () => {
    const p = await newPoll(A);
    const results = await Promise.allSettled(Array.from({ length: 12 }, () => vote(p.id, p.opts[0], token('f'))));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await counts(p.id)).toEqual([1, 0]);
  });

  it('keeps counts exact under concurrent votes from different browsers on one option', async () => {
    const p = await newPoll(A);
    for (let round = 0; round < 3; round++) {
      await Promise.all(Array.from({ length: 20 }, (_, i) => vote(p.id, p.opts[0], (round * 100 + i + 1).toString(16).padStart(64, '0'))));
    }
    const rows = (await db.admin('select count(*)::int c from votes where poll_id=$1', [p.id])).rows[0].c;
    expect(rows).toBe(60);
    expect(await counts(p.id)).toEqual([60, 0]);
  });

  it('cannot be called by browsers (anon or signed-in): identity cannot be supplied by the client', async () => {
    await expect(
      db.as('anon', null, 'select public.cast_vote($1,$2,$3,null)', [pollId, optX, token('9')]),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      db.as('authenticated', A, 'select public.cast_vote($1,$2,$3,$4)', [pollId, optX, token('9'), A]),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('keeps counts equal to vote rows when a vote row is removed', async () => {
    const p = await newPoll(A);
    await vote(p.id, p.opts[0], token('1'));
    await vote(p.id, p.opts[0], token('2'));
    await db.admin('delete from votes where voter_token=$1', [token('1')]);
    expect(await counts(p.id)).toEqual([1, 0]);
  });

  it('keeps counts correct after each vote for every option (sum of counts = vote rows)', async () => {
    const r = await db.admin(
      `select count(*)::int bad from polls p
        where (select coalesce(sum(votes),0) from poll_options where poll_id=p.id)
           <> (select count(*) from votes where poll_id=p.id)`,
    );
    expect(r.rows[0].bad).toBe(0);
  });
});

describe('RLS: votes are private and write-protected', () => {
  it('anon and signed-in users cannot read or insert votes directly', async () => {
    await expect(db.as('anon', null, 'select * from votes')).rejects.toMatchObject({ code: '42501' });
    await expect(db.as('authenticated', A, 'select * from votes')).rejects.toMatchObject({ code: '42501' });
    await expect(
      db.as('anon', null, 'insert into votes(poll_id,option_id,voter_token) values ($1,$2,$3)', [pollId, optX, token('7')]),
    ).rejects.toMatchObject({ code: '42501' });
  });
});

describe('RLS: polls and options', () => {
  it('lets anyone read polls, options and totals by link', async () => {
    expect((await db.as('anon', null, 'select id from polls where id=$1', [pollId])).rowCount).toBe(1);
    expect((await db.as('anon', null, 'select id from poll_options where poll_id=$1', [pollId])).rowCount).toBe(2);
    const p = await newPoll(A);
    await vote(p.id, p.opts[0], token('4'));
    await vote(p.id, p.opts[1], token('5'));
    const t = await db.as('anon', null, 'select total_votes from polls_with_totals where id=$1', [p.id]);
    expect(t.rows[0].total_votes).toBe(2);
  });

  it('refuses anonymous poll creation, direct and via the RPC', async () => {
    await expect(
      db.as('anon', null, `insert into polls(title,created_by) values ('x', null)`),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      db.as('anon', null, `select public.create_poll_with_options('t', null, array['a','b'])`),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('refuses a signed-in user inserting a poll owned by someone else or by nobody', async () => {
    await expect(
      db.as('authenticated', A, `insert into polls(title,created_by) values ('x',$1)`, [B]),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      db.as('authenticated', A, `insert into polls(title,created_by) values ('x',null)`),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('lets only the owner update or delete a poll', async () => {
    const p = await newPoll(A, 'Mine');
    const upd = await db.as('authenticated', B, `update polls set title='hacked' where id=$1`, [p.id]);
    expect(upd.rowCount).toBe(0);
    const del = await db.as('authenticated', B, `delete from polls where id=$1`, [p.id]);
    expect(del.rowCount).toBe(0);
    const anonDel = await db.as('anon', null, `delete from polls where id=$1`, [p.id]);
    expect(anonDel.rowCount).toBe(0);
    expect((await db.as('authenticated', A, `update polls set title='Renamed' where id=$1`, [p.id])).rowCount).toBe(1);
    expect((await db.admin('select title, updated_at > created_at as touched from polls where id=$1', [p.id])).rows[0]).toEqual({ title: 'Renamed', touched: true });
    expect((await db.as('authenticated', A, `delete from polls where id=$1`, [p.id])).rowCount).toBe(1);
  });

  it('does not let an owner transfer a poll to another user', async () => {
    const p = await newPoll(A);
    await expect(
      db.as('authenticated', A, `update polls set created_by=$2 where id=$1`, [p.id, B]),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('does not let anyone, owner included, edit vote counts directly', async () => {
    const p = await newPoll(A);
    await vote(p.id, p.opts[0], token('6'));
    const r = await db.as('authenticated', A, `update poll_options set votes=999 where id=$1`, [p.opts[0]]);
    expect(r.rowCount).toBe(0);
    expect((await counts(p.id))[0]).toBe(1);
  });

  it('does not let an owner insert an option with preset votes, or negative votes', async () => {
    const fresh = await newPoll(A);
    await expect(
      db.as('authenticated', A, `insert into poll_options(poll_id,text,votes) values ($1,'x',999)`, [fresh.id]),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      db.as('authenticated', A, `insert into poll_options(poll_id,text,votes) values ($1,'x',-1)`, [fresh.id]),
    ).rejects.toBeTruthy();
    const p = await newPoll(A);
    await expect(
      db.as('authenticated', A, `insert into poll_options(poll_id,text,votes) values ($1,'x',999)`, [p.id]),
    ).rejects.toMatchObject({ code: '42501' });
    expect((await db.as('anon', null, 'select total_votes from polls_with_totals where id=$1', [p.id])).rows[0].total_votes).toBe(0);
  });

  it('lets an owner add options to a poll with no votes, up to 20, and never after voting starts', async () => {
    const p = await newPoll(A);
    await db.as('authenticated', A, `insert into poll_options(poll_id,text,position) values ($1,'third',2)`, [p.id]);
    for (let i = 3; i < 20; i++) {
      await db.as('authenticated', A, `insert into poll_options(poll_id,text,position) values ($1,$2,$3)`, [p.id, `o${i}`, i]);
    }
    await expect(
      db.as('authenticated', A, `insert into poll_options(poll_id,text,position) values ($1,'21st',20)`, [p.id]),
    ).rejects.toMatchObject({ code: 'VT007' });

    const q = await newPoll(A);
    await vote(q.id, q.opts[0], token('b'));
    await expect(
      db.as('authenticated', A, `insert into poll_options(poll_id,text,position) values ($1,'late',2)`, [q.id]),
    ).rejects.toMatchObject({ code: 'VT008' });
    expect(await counts(q.id)).toEqual([1, 0]);
  });

  it('serialises option inserts and votes: whichever commits second sees the other', async () => {
    // Vote in flight first: the option insert must wait, then be refused.
    const p = await newPoll(A);
    const c = await db.pool.connect();
    try {
      await c.query('BEGIN');
      await c.query('select public.cast_vote($1,$2,$3,null)', [p.id, p.opts[0], token('c')]);
      const ins = db.as('authenticated', A, `insert into poll_options(poll_id,text,position) values ($1,'late',2)`, [p.id]);
      const settled = ins.then(() => 'inserted', (e) => e.code);
      await new Promise((r) => setTimeout(r, 300));
      await c.query('COMMIT');
      expect(await settled).toBe('VT008');
    } finally {
      c.release();
    }

    // Option insert in flight first: the vote must wait, then succeed, and the poll stays consistent.
    const q = await newPoll(A);
    const c2 = await db.pool.connect();
    try {
      await c2.query('BEGIN');
      await c2.query(`select set_config('request.jwt.claim.sub', $1, true)`, [A]);
      await c2.query('SET LOCAL ROLE authenticated');
      await c2.query(`insert into poll_options(poll_id,text,position) values ($1,'extra',2)`, [q.id]);
      const v = vote(q.id, q.opts[0], token('d')).then(() => 'voted', (e) => e.code);
      await new Promise((r) => setTimeout(r, 300));
      await c2.query('COMMIT');
      expect(await v).toBe('voted');
    } finally {
      c2.release();
    }
    expect(await counts(q.id)).toEqual([1, 0, 0]);
  });

  it('does not let a user add options to someone else\'s poll', async () => {
    const theirs = await newPoll(A);
    await expect(
      db.as('authenticated', B, `insert into poll_options(poll_id,text) values ($1,'sneaky')`, [theirs.id]),
    ).rejects.toMatchObject({ code: '42501' });
    // On a poll that already has votes the guard refuses first; either way nothing is inserted.
    await expect(
      db.as('authenticated', B, `insert into poll_options(poll_id,text) values ($1,'sneaky')`, [pollId]),
    ).rejects.toBeTruthy();
    expect((await db.admin(`select count(*)::int c from poll_options where text='sneaky'`)).rows[0].c).toBe(0);
  });

  it('a poll delete racing an in-flight vote leaves no orphan votes or options', async () => {
    const p = await newPoll(A);
    const c = await db.pool.connect();
    try {
      await c.query('BEGIN');
      await c.query('select public.cast_vote($1,$2,$3,null)', [p.id, p.opts[0], token('8')]);
      const del = db.admin('delete from polls where id=$1', [p.id]); // blocks on the vote's key share lock
      await new Promise((r) => setTimeout(r, 300));
      await c.query('COMMIT');
      await del;
    } finally {
      c.release();
    }
    for (const t of ['votes', 'poll_options']) {
      expect((await db.admin(`select count(*)::int c from ${t} where poll_id=$1`, [p.id])).rows[0].c).toBe(0);
    }
  });

  it('a vote arriving after the poll was deleted gets POLL_NOT_FOUND and records nothing', async () => {
    const p = await newPoll(A);
    await db.admin('delete from polls where id=$1', [p.id]);
    await expect(vote(p.id, p.opts[0], token('7'))).rejects.toMatchObject({ code: 'VT003' });
    expect((await db.admin('select count(*)::int c from votes where voter_token=$1', [token('7')])).rows[0].c).toBe(0);
  });

  it('deleting a poll removes its options and votes', async () => {
    const p = await newPoll(A);
    await vote(p.id, p.opts[0], token('5'));
    await db.as('authenticated', A, `delete from polls where id=$1`, [p.id]);
    expect((await db.admin('select count(*)::int c from poll_options where poll_id=$1', [p.id])).rows[0].c).toBe(0);
    expect((await db.admin('select count(*)::int c from votes where poll_id=$1', [p.id])).rows[0].c).toBe(0);
  });
});

describe('create_poll_with_options', () => {
  it('trims, drops blanks, keeps order and stores the owner', async () => {
    const r = await db.as('authenticated', A, `select public.create_poll_with_options('  Lunch? ', '  ', array['  Pizza ','','Tacos','  ']) as id`);
    const id = r.rows[0].id;
    const o = await db.admin('select text from poll_options where poll_id=$1 order by position', [id]);
    expect(o.rows.map((x) => x.text)).toEqual(['Pizza', 'Tacos']);
    const p = await db.admin('select title, description, created_by from polls where id=$1', [id]);
    expect(p.rows[0]).toEqual({ title: 'Lunch?', description: null, created_by: A });
  });

  it.each([
    ['blank title', `select public.create_poll_with_options('  ', null, array['a','b'])`, 'VT006'],
    ['one option', `select public.create_poll_with_options('t', null, array['a'])`, 'VT007'],
    ['only blank options', `select public.create_poll_with_options('t', null, array['a',' '])`, 'VT007'],
    ['too many options', `select public.create_poll_with_options('t', null, (select array_agg('o'||g) from generate_series(1,21) g))`, 'VT007'],
    ['overlong option', `select public.create_poll_with_options('t', null, array['a', repeat('x',201)])`, 'VT007'],
    ['overlong title', `select public.create_poll_with_options(repeat('x',201), null, array['a','b'])`, 'VT006'],
  ])('rejects %s and creates nothing', async (_n, sql, code) => {
    const before = (await db.admin('select count(*)::int c from polls')).rows[0].c;
    await expect(db.as('authenticated', A, sql)).rejects.toMatchObject({ code });
    expect((await db.admin('select count(*)::int c from polls')).rows[0].c).toBe(before);
  });
});
