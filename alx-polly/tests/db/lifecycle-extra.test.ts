import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, migrateAll, token, type TestDb } from './harness';

// The exact statements lib/actions-poll-admin.ts and the edit page send, run against the real schema.

const A = '00000000-0000-4000-8000-0000000000a1';
const B = '00000000-0000-4000-8000-0000000000b1';

let db: TestDb;

async function newPoll(owner: string, closesAt: string | null = null) {
  const r = await db.as('authenticated', owner, 'select public.create_poll_with_options($1,$2,$3,$4) as id', [
    'Q',
    null,
    ['X', 'Y'],
    closesAt,
  ]);
  const id = r.rows[0].id as string;
  const o = await db.admin('select id from poll_options where poll_id=$1 order by position', [id]);
  return { id, opts: o.rows.map((x) => x.id as string) };
}
const vote = (poll: string, opt: string, tok: string) =>
  db.as('service_role', null, 'select public.cast_vote($1,$2,$3,null) as id', [poll, opt, tok]);
const isClosed = async (id: string) =>
  (await db.as('anon', null, 'select (public.get_poll($1)->>\'is_closed\')::boolean as c', [id])).rows[0].c as boolean;

beforeAll(async () => {
  db = await createDb();
  await migrateAll(db);
  await db.admin('insert into auth.users(id,email) values ($1,$2),($3,$4)', [A, 'a@x.test', B, 'b@x.test']);
});
afterAll(async () => {
  await db.drop();
});

describe('reopening a poll that closed by its closing time', () => {
  it('stays closed if only closed_at is cleared, opens once the passed closes_at is cleared too', async () => {
    const p = await newPoll(A, new Date(Date.now() + 3600_000).toISOString());
    await db.admin(`update polls set closes_at = now() - interval '1 minute' where id=$1`, [p.id]);
    expect(await isClosed(p.id)).toBe(true);

    // What a naive "reopen" does: not enough.
    await db.as('authenticated', A, 'update polls set closed_at = null where id=$1', [p.id]);
    expect(await isClosed(p.id)).toBe(true);
    await expect(vote(p.id, p.opts[0], token('1'))).rejects.toMatchObject({ code: 'VT009' });

    // What reopenPollAction does.
    const r = await db.as('authenticated', A, 'update polls set closed_at = null, closes_at = null where id=$1 returning id', [p.id]);
    expect(r.rowCount).toBe(1);
    expect(await isClosed(p.id)).toBe(false);
    await vote(p.id, p.opts[0], token('1'));
  });

  it('a new future closing time also reopens a poll closed by time (edit page flow)', async () => {
    const p = await newPoll(A, new Date(Date.now() + 3600_000).toISOString());
    await db.admin(`update polls set closes_at = now() - interval '1 minute' where id=$1`, [p.id]);
    await db.as('authenticated', A, `update polls set closes_at = now() + interval '1 day' where id=$1`, [p.id]);
    expect(await isClosed(p.id)).toBe(false);
  });

  it('keeps a still-future closing time when a hand-closed poll is reopened', async () => {
    const p = await newPoll(A, new Date(Date.now() + 3600_000).toISOString());
    await db.as('authenticated', A, 'update polls set closed_at = now() where id=$1', [p.id]);
    expect(await isClosed(p.id)).toBe(true);
    await db.as('authenticated', A, 'update polls set closed_at = null where id=$1', [p.id]);
    expect(await isClosed(p.id)).toBe(false);
    const row = await db.admin('select closes_at from polls where id=$1', [p.id]);
    expect(row.rows[0].closes_at).not.toBeNull();
  });
});

describe('settings updates by the owner', () => {
  it('changes require_login and results_visibility; a stranger changes nothing', async () => {
    const p = await newPoll(A);
    const own = await db.as(
      'authenticated',
      A,
      `update polls set require_login = true, results_visibility = 'after_close' where id=$1 returning id`,
      [p.id],
    );
    expect(own.rowCount).toBe(1);
    const other = await db.as('authenticated', B, `update polls set require_login = false where id=$1 returning id`, [p.id]);
    expect(other.rowCount).toBe(0);
    const row = await db.admin('select require_login, results_visibility from polls where id=$1', [p.id]);
    expect(row.rows[0]).toEqual({ require_login: true, results_visibility: 'after_close' });
  });

  it('rejects an unknown visibility value on update (CHECK constraint)', async () => {
    const p = await newPoll(A);
    await expect(
      db.as('authenticated', A, `update polls set results_visibility = 'never' where id=$1`, [p.id]),
    ).rejects.toMatchObject({ code: '23514' });
  });
});

describe('what the edit page and export read as the owner', () => {
  it('owner reads option vote totals through RLS; a stranger and anon read nothing', async () => {
    const p = await newPoll(A);
    await vote(p.id, p.opts[0], token('1'));
    await vote(p.id, p.opts[0], token('2'));
    const own = await db.as('authenticated', A, 'select text, votes from poll_options where poll_id=$1 order by position', [p.id]);
    expect(own.rows).toEqual([
      { text: 'X', votes: 2 },
      { text: 'Y', votes: 0 },
    ]);
    expect((await db.as('authenticated', B, 'select 1 from poll_options where poll_id=$1', [p.id])).rowCount).toBe(0);
    expect((await db.as('anon', null, 'select 1 from poll_options where poll_id=$1', [p.id])).rowCount).toBe(0);
  });

  it('replace_poll_options keeps the new order, and the edit page lock (votes > 0) matches the database refusal', async () => {
    const p = await newPoll(A);
    await db.as('authenticated', A, 'select public.replace_poll_options($1,$2)', [p.id, ['Z', 'Y', 'X']]);
    const order = await db.as('authenticated', A, 'select text from poll_options where poll_id=$1 order by position', [p.id]);
    expect(order.rows.map((r) => r.text)).toEqual(['Z', 'Y', 'X']);

    const opt = await db.admin('select id from poll_options where poll_id=$1 and text=$2', [p.id, 'Y']);
    await vote(p.id, opt.rows[0].id, token('1'));
    const sum = await db.as('authenticated', A, 'select coalesce(sum(votes),0)::int as n from poll_options where poll_id=$1', [p.id]);
    expect(sum.rows[0].n).toBe(1);
    await expect(
      db.as('authenticated', A, 'select public.replace_poll_options($1,$2)', [p.id, ['P', 'Q']]),
    ).rejects.toMatchObject({ code: 'VT008' });
  });
});
