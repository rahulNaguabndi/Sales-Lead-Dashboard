import { ulid } from 'ulid';
import { req } from './auth/helpers';
import { setupActivityEnv, type Ctx } from './activity-helpers';

export { EMAIL } from './activity-helpers';
export type { Ctx };

type Handler = (r: Request, ctx: { params: { id: string } }) => Promise<Response>;

export type StageCtx = Ctx & {
  patch: (cookie: string | null, leadId: string, body: unknown) => Promise<Response>;
  addFollowUp: (leadId: string, status?: string) => string;
  addOffer: (o?: { active?: boolean; validTo?: number }) => string;
  rows: (sql: string, ...args: unknown[]) => Record<string, unknown>[];
};

export async function setupStageEnv(): Promise<StageCtx> {
  const c = await setupActivityEnv();
  const handler = (await import('@/app/api/leads/[id]/stage/route')).PATCH as unknown as Handler;
  return Object.assign(c, {
    patch: (cookie: string | null, leadId: string, body: unknown) =>
      handler(
        req(`/api/leads/${leadId}/stage`, {
          method: 'PATCH',
          body,
          cookie: cookie ?? undefined,
          headers: { host: 'localhost' },
        }),
        { params: { id: leadId } },
      ),
    addFollowUp(leadId: string, status = 'PENDING') {
      const id = ulid();
      const owner = (c.lead(leadId) as { owner_id: string }).owner_id;
      c.sqlite
        .prepare(
          `insert into follow_ups (id, lead_id, assigned_to, due_at, status, created_at)
           values (?, ?, ?, ?, ?, ?)`,
        )
        .run(id, leadId, owner, Date.now() + 86_400_000, status, Date.now());
      return id;
    },
    addOffer(o: { active?: boolean; validTo?: number } = {}) {
      const id = ulid();
      c.sqlite
        .prepare(
          `insert into offers (id, title, description, discount_type, value, valid_from, valid_to, eligibility, is_active, created_at)
           values (?, 'Spring bonus', 'd', 'AMOUNT', 100000, ?, ?, '{}', ?, ?)`,
        )
        .run(
          id,
          Date.now() - 86_400_000,
          o.validTo ?? Date.now() + 86_400_000,
          o.active === false ? 0 : 1,
          Date.now(),
        );
      return id;
    },
    rows: (sql: string, ...args: unknown[]) =>
      c.sqlite.prepare(sql).all(...args) as Record<string, unknown>[],
  });
}
