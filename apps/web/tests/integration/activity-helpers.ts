import type Database from 'better-sqlite3';
import { ulid } from 'ulid';
import { cookieFrom, PASSWORD, req, setupAuthEnv } from './auth/helpers';

export const EMAIL = {
  sofia: 'sofia.rossi@eurodrive.test',
  marco: 'marco.bianchi@eurodrive.test', // manager, South
  lukas: 'lukas.becker@eurodrive.test', // manager, DACH
  anna: 'anna.weber@eurodrive.test', // rep, DACH
  isabelle: 'isabelle.laurent@eurodrive.test', // VP
};

export type Ctx = {
  sqlite: Database.Database;
  post: typeof postActivity;
  login: (email: string) => Promise<string>;
  userId: (email: string) => string;
  createLead: (o?: LeadOverrides) => string;
  lead: (id: string) => Record<string, unknown>;
  counts: () => Counts;
  reqId: () => string;
};

export type Counts = { activities: number; audit: number; stageHistory: number; followUps: number };

export type LeadOverrides = {
  owner?: string | null; // email; null = pool lead
  team?: string; // team name match, defaults to the owner's team
  stage?: string;
  attemptCount?: number;
  firstResponseAt?: number | null;
  score?: number;
  priority?: string;
};

let ipCounter = 0;
let handler: (req: Request, ctx: { params: { id: string } }) => Promise<Response>;

async function postActivity(
  cookie: string | null,
  leadId: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  return handler(
    req(`/api/leads/${leadId}/activities`, {
      method: 'POST',
      body,
      cookie: cookie ?? undefined,
      headers: { host: 'localhost', ...headers },
    }) as never,
    { params: { id: leadId } },
  );
}

export async function setupActivityEnv(): Promise<Ctx> {
  await setupAuthEnv();
  const { openDatabase } = await import('@/server/db/client');
  const { sqlite } = openDatabase(process.env.DATABASE_URL!);
  const login = (await import('@/app/api/auth/login/route')).POST;
  handler = (await import('@/app/api/leads/[id]/activities/route')).POST as never;

  const ctx: Ctx = {
    sqlite,
    post: postActivity,
    reqId: () => ulid(),
    async login(email) {
      const res = await login(
        req('/api/auth/login', {
          method: 'POST',
          body: { email, password: PASSWORD },
          headers: {
            'x-forwarded-for': `10.1.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`,
          },
        }),
      );
      if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status}`);
      return cookieFrom(res);
    },
    userId(email) {
      return (sqlite.prepare('select id from users where email = ?').get(email) as { id: string })
        .id;
    },
    lead(id) {
      return sqlite.prepare('select * from leads where id = ?').get(id) as Record<string, unknown>;
    },
    counts() {
      const n = (t: string) =>
        (sqlite.prepare(`select count(*) n from ${t}`).get() as { n: number }).n;
      return {
        activities: n('activities'),
        audit: n('audit_log'),
        stageHistory: n('stage_history'),
        followUps: n('follow_ups'),
      };
    },
    createLead(o = {}) {
      const owner = o.owner === undefined ? EMAIL.sofia : o.owner;
      const ownerRow = owner
        ? (sqlite.prepare('select id, team_id from users where email = ?').get(owner) as {
            id: string;
            team_id: string;
          })
        : null;
      const teamId =
        ownerRow?.team_id ??
        (
          sqlite
            .prepare('select id from teams where name like ?')
            .get(`%${o.team ?? 'South'}%`) as { id: string }
        ).id;
      const tpl = sqlite
        .prepare('select * from leads where team_id = ? limit 1')
        .get(teamId) as Record<string, unknown>;
      const id = ulid();
      const now = Date.now();
      sqlite
        .prepare(
          `insert into leads (id, reference, customer_id, team_id, owner_id, source, stage, vehicle_model,
             has_trade_in, wants_finance, test_drive_requested, score, priority, score_breakdown,
             attempt_count, first_response_at, created_at, updated_at, version)
           values (@id, @reference, @customer_id, @team_id, @owner_id, @source, @stage, @vehicle_model,
             0, 0, 0, @score, @priority, @breakdown, @attempt_count, @first_response_at, @created_at, @updated_at, 3)`,
        )
        .run({
          id,
          reference: `T-${id.slice(-10)}`,
          customer_id: tpl.customer_id,
          team_id: teamId,
          owner_id: ownerRow?.id ?? null,
          source: tpl.source,
          stage: o.stage ?? 'NEW',
          vehicle_model: tpl.vehicle_model,
          score: o.score ?? 30,
          priority: o.priority ?? 'COOL',
          breakdown: JSON.stringify({
            intent: 0,
            source: 0,
            customer: 0,
            freshness: 0,
            engagement: 0,
          }),
          attempt_count: o.attemptCount ?? 0,
          first_response_at: o.firstResponseAt ?? null,
          created_at: now - 3_600_000,
          updated_at: now - 3_600_000,
        });
      return id;
    },
  };
  return ctx;
}

export const ok = (extra: Record<string, unknown> = {}) => ({
  clientRequestId: ulid(),
  type: 'CALL',
  outcome: 'CONNECTED',
  note: 'Called customer',
  ...extra,
});
