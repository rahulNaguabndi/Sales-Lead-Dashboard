import { describe, expect, it } from 'vitest';
import { ulid } from 'ulid';
import { getLeadDetail, listActivities } from '@/server/services/lead-detail';
import { addActivity, createDetailFixture } from './helpers';

describe('getLeadDetail', () => {
  it('returns lead, customer, owner, team, follow-ups and permissions', async () => {
    const fx = createDetailFixture();
    const d = await getLeadDetail(fx.users.anna!, fx.ids.L1!, { database: fx.db });
    expect(d.lead.reference).toBe('REF-L1');
    expect(d.lead.stage).toBe('CONTACTED');
    expect(d.customer.firstName).toBe('A');
    expect(d.owner?.name).toBe('anna');
    expect(d.team.name).toBe('Team DACH');
    expect(d.followUps).toEqual({ next: null, pendingCount: 0 });
    expect(d.history.previousLeads.length).toBeGreaterThan(0); // fixture customer c1 owns every lead
    expect(d.permissions.canLogActivity).toBe(true);
  });

  it('marks the next pending follow-up and counts pending ones', async () => {
    const fx = createDetailFixture();
    const ins = fx.sqlite.prepare(
      `INSERT INTO follow_ups (id, lead_id, assigned_to, due_at, status, created_at) VALUES (?, ?, 'anna', ?, ?, 1)`,
    );
    ins.run(ulid(), fx.ids.L1, 2000, 'PENDING');
    ins.run(ulid(), fx.ids.L1, 1000, 'PENDING');
    ins.run(ulid(), fx.ids.L1, 500, 'DONE');
    const d = await getLeadDetail(fx.users.anna!, fx.ids.L1!, { database: fx.db });
    expect(d.followUps.pendingCount).toBe(2);
    expect(d.followUps.next?.dueAt).toBe(1000);
  });

  it('history: previous leads carry canView and purchases are listed', async () => {
    const fx = createDetailFixture();
    fx.sqlite
      .prepare(
        `INSERT INTO purchases (id, customer_id, vehicle_model, amount, purchased_at) VALUES (?, 'c1', 'metro-hatch', 2150000, 5)`,
      )
      .run(ulid());
    const d = await getLeadDetail(fx.users.anna!, fx.ids.L1!, { database: fx.db });
    const byRef = new Map(d.history.previousLeads.map((p) => [p.reference, p]));
    expect(byRef.get('REF-L5')?.canView).toBe(true); // anna's own
    expect(byRef.get('REF-L2')?.canView).toBe(false); // sofia's, other team
    expect(byRef.get('REF-L2')?.ownerName).toBe('sofia'); // says whose it is
    expect(d.history.purchases).toEqual([
      { vehicleModel: 'metro-hatch', amount: 2150000, purchasedAt: 5 },
    ]);
  });

  it('first enquiry: no previous leads', async () => {
    const fx = createDetailFixture();
    fx.sqlite.exec(
      `INSERT INTO customers (id, first_name, last_name, email, country, language, preferred_channel, created_at)
       VALUES ('c2', 'N', 'M', 'n@m.test', 'DE', 'de', 'EMAIL', 1)`,
    );
    fx.sqlite.prepare("UPDATE leads SET customer_id = 'c2' WHERE id = ?").run(fx.ids.L1);
    const d = await getLeadDetail(fx.users.anna!, fx.ids.L1!, { database: fx.db });
    expect(d.history.previousLeads).toEqual([]);
    expect(d.history.purchases).toEqual([]);
  });

  it('is read-only: viewing creates no activity and changes no lead', async () => {
    const fx = createDetailFixture();
    const before = fx.sqlite.prepare('SELECT * FROM leads WHERE id = ?').get(fx.ids.L1);
    await getLeadDetail(fx.users.anna!, fx.ids.L1!, { database: fx.db });
    await listActivities(fx.users.anna!, fx.ids.L1!, {}, { database: fx.db });
    expect(fx.sqlite.prepare('SELECT count(*) n FROM activities').get()).toEqual({ n: 0 });
    expect(fx.sqlite.prepare('SELECT * FROM leads WHERE id = ?').get(fx.ids.L1)).toEqual(before);
  });

  it('is fast on small data (coarse SC-001 check)', async () => {
    const fx = createDetailFixture();
    for (let i = 0; i < 60; i++) addActivity(fx, fx.ids.L1!, { createdAt: i + 1 });
    const t0 = performance.now();
    await getLeadDetail(fx.users.anna!, fx.ids.L1!, { database: fx.db });
    await listActivities(fx.users.anna!, fx.ids.L1!, {}, { database: fx.db });
    expect(performance.now() - t0).toBeLessThan(150);
  });
});

describe('listActivities', () => {
  it('orders by (created_at, id) in both directions, ties broken by id', async () => {
    const fx = createDetailFixture();
    const lead = fx.ids.L1!;
    addActivity(fx, lead, { id: 'A1', createdAt: 100 });
    addActivity(fx, lead, { id: 'A3', createdAt: 100 });
    addActivity(fx, lead, { id: 'A2', createdAt: 100 });
    addActivity(fx, lead, { id: 'A0', createdAt: 50 });
    addActivity(fx, lead, { id: 'A9', createdAt: 200 });
    const desc = await listActivities(fx.users.anna!, lead, { order: 'desc' }, { database: fx.db });
    expect(desc.items.map((i) => i.id)).toEqual(['A9', 'A3', 'A2', 'A1', 'A0']);
    const asc = await listActivities(fx.users.anna!, lead, { order: 'asc' }, { database: fx.db });
    expect(asc.items.map((i) => i.id)).toEqual(['A0', 'A1', 'A2', 'A3', 'A9']);
  });

  it('filters by kind and resolves actors (null actor for system)', async () => {
    const fx = createDetailFixture();
    const lead = fx.ids.L1!;
    for (let i = 0; i < 6; i++) addActivity(fx, lead, { createdAt: i + 1, actorId: 'anna' });
    for (let i = 0; i < 4; i++) {
      addActivity(fx, lead, { createdAt: 10 + i, kind: 'SYSTEM', type: 'STAGE_CHANGED' });
    }
    const db = { database: fx.db };
    const all = await listActivities(fx.users.anna!, lead, {}, db);
    expect(all.items).toHaveLength(10);
    const user = await listActivities(fx.users.anna!, lead, { kind: 'USER' }, db);
    expect(user.items).toHaveLength(6);
    expect(user.items[0]!.actor?.name).toBe('anna');
    const sys = await listActivities(fx.users.anna!, lead, { kind: 'SYSTEM' }, db);
    expect(sys.items).toHaveLength(4);
    expect(sys.items[0]!.actor).toBeNull();
  });

  it('pages completely with no gaps or duplicates (SC-002) and caps limit at 100', async () => {
    const fx = createDetailFixture();
    const lead = fx.ids.L1!;
    for (let i = 0; i < 120; i++) addActivity(fx, lead, { createdAt: Math.floor(i / 7) });
    const db = { database: fx.db };
    for (const order of ['asc', 'desc'] as const) {
      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const page = await listActivities(fx.users.anna!, lead, { order, limit: 50, cursor }, db);
        seen.push(...page.items.map((i) => i.id));
        cursor = page.nextCursor;
      } while (cursor);
      expect(seen).toHaveLength(120);
      expect(new Set(seen).size).toBe(120);
    }
    const big = await listActivities(fx.users.anna!, lead, { limit: 1000 }, db);
    expect(big.items).toHaveLength(100);
    expect(big.nextCursor).not.toBeNull();
  });

  it('rejects an invalid cursor with 400', async () => {
    const fx = createDetailFixture();
    await expect(
      listActivities(fx.users.anna!, fx.ids.L1!, { cursor: 'garbage!' }, { database: fx.db }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
