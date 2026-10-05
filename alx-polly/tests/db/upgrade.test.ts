import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR, createDb, migrateAll, token, type TestDb } from './harness';

// Simulates a live project that already ran the first two migrations and holds
// real data, then applies the rest and checks nothing is lost or left inconsistent.

const U1 = '00000000-0000-4000-8000-0000000000a1';
const P = '10000000-0000-4000-8000-000000000001';
const P2 = '10000000-0000-4000-8000-000000000002';
const O1 = '20000000-0000-4000-8000-000000000001';
const O2 = '20000000-0000-4000-8000-000000000002';
const O3 = '20000000-0000-4000-8000-000000000003';

let db: TestDb;
let oldDir: string;

beforeAll(async () => {
  db = await createDb();
  oldDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-old-'));
  const all = fs.readdirSync(MIGRATIONS_DIR).sort();
  const legacy = all.filter((f) => f < '20251005');
  expect(legacy.length).toBeGreaterThanOrEqual(2);
  for (const f of legacy) fs.copyFileSync(path.join(MIGRATIONS_DIR, f), path.join(oldDir, f));
  await migrateAll(db, oldDir);

  await db.admin('insert into auth.users(id,email) values ($1,$2)', [U1, 'u@x.test']);
  await db.admin(`insert into polls(id,title,created_by) values ($1,'Legacy',$2),($3,'Anon-made',null)`, [P, U1, P2]);
  await db.admin(
    `insert into poll_options(id,poll_id,text,votes) values ($1,$2,'A',2),($3,$2,'B',0),($4,$5,'Z',0)`,
    [O1, P, O2, O3, P2],
  );
  // Legacy vote rows: one per IP, one per user; and a stale count (O1 says 2, rows say 2).
  await db.admin(`insert into votes(poll_id,option_id,ip_address) values ($1,$2,'203.0.113.9')`, [P, O1]);
  await db.admin(`insert into votes(poll_id,option_id,user_id) values ($1,$2,$3)`, [P, O1, U1]);
  // Poll with a count that no vote row backs (e.g. hand-seeded): must be corrected.
  await db.admin(`update poll_options set votes=5 where id=$1`, [O3]);
});
afterAll(async () => {
  await db.drop();
  fs.rmSync(oldDir, { recursive: true, force: true });
});

describe('upgrading a database that already has data', () => {
  it('applies only the new migration(s) and keeps every poll, option and vote row', async () => {
    const applied = await migrateAll(db);
    expect(applied.every((f) => f >= '20251005')).toBe(true);
    expect(applied.length).toBeGreaterThan(0);
    expect((await db.admin('select count(*)::int c from polls')).rows[0].c).toBe(2);
    expect((await db.admin('select count(*)::int c from poll_options')).rows[0].c).toBe(3);
    const votes = await db.admin('select ip_address, user_id, voter_token from votes order by ip_address nulls last');
    expect(votes.rows).toEqual([
      { ip_address: '203.0.113.9', user_id: null, voter_token: null },
      { ip_address: null, user_id: U1, voter_token: null },
    ]);
  });

  it('recomputes cached counts from vote rows', async () => {
    const r = await db.admin('select id, votes::int v from poll_options order by id');
    expect(Object.fromEntries(r.rows.map((x) => [x.id, x.v]))).toEqual({ [O1]: 2, [O2]: 0, [O3]: 0 });
  });

  it('gives existing options a stable position', async () => {
    const r = await db.admin('select position from poll_options where poll_id=$1 order by position', [P]);
    expect(r.rows.map((x) => x.position)).toEqual([0, 1]);
  });

  it('lets a legacy voter\'s browser vote once more, then enforces the limit', async () => {
    await db.as('service_role', null, 'select public.cast_vote($1,$2,$3,null)', [P, O2, token('a')]);
    await expect(
      db.as('service_role', null, 'select public.cast_vote($1,$2,$3,null)', [P, O2, token('a')]),
    ).rejects.toMatchObject({ code: 'VT002' });
    expect((await db.admin('select votes::int v from poll_options where id=$1', [O2])).rows[0].v).toBe(1);
  });

  it('removes the IP/user uniqueness that blocked unrelated voters', async () => {
    const r = await db.admin(
      `select conname from pg_constraint where conrelid='public.votes'::regclass and conname in ('unique_ip_poll_vote','unique_user_poll_vote','user_or_ip_required')`,
    );
    expect(r.rows).toEqual([]);
  });

  it('removes the old IP-trusting RPC', async () => {
    const r = await db.admin(`select proname from pg_proc where proname in ('vote_for_option','increment_vote')`);
    expect(r.rows).toEqual([]);
  });

  it('enforces option/poll integrity even for the table owner path', async () => {
    await expect(
      db.admin(`insert into votes(poll_id,option_id,voter_token) values ($1,$2,$3)`, [P, O3, token('c')]),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('leaves polls with no owner readable but unmanageable', async () => {
    expect((await db.as('anon', null, 'select id from polls where id=$1', [P2])).rowCount).toBe(1);
    expect((await db.as('authenticated', U1, 'delete from polls where id=$1', [P2])).rowCount).toBe(0);
  });
});
