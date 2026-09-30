import { ulid } from 'ulid';
import { req } from '../integration/auth/helpers';
import { EMAIL, setupActivityEnv, type Ctx } from '../integration/activity-helpers';

export { EMAIL };
export const DAY = 86_400_000;
export const HOUR = 3_600_000;

export type User = { id: string; name: string; email: string; role: 'REP' | 'MANAGER' | 'VP'; teamId: string | null };

export type FollowUpEnv = Ctx & {
  user: (email: string) => User;
  addFollowUp: (o: {
    leadId: string;
    assignedTo: string;
    dueAt: number;
    status?: string;
  }) => string;
  call: (
    cookie: string | null,
    method: string,
    url: string,
    body?: unknown,
  ) => Promise<Response>;
};

/** Temp migrated + seeded database plus helpers for F08 service, RBAC and job tests. */
export async function setupFollowUpEnv(): Promise<FollowUpEnv> {
  const ctx = await setupActivityEnv();
  const list = (await import('@/app/api/follow-ups/route')).GET;
  const patch = (await import('@/app/api/follow-ups/[id]/route')).PATCH;
  const post = (await import('@/app/api/leads/[id]/follow-ups/route')).POST;

  return {
    ...ctx,
    user(email) {
      return ctx.sqlite
        .prepare('select id, name, email, role, team_id as teamId from users where email = ?')
        .get(email) as User;
    },
    addFollowUp(o) {
      const id = ulid();
      ctx.sqlite
        .prepare(
          `insert into follow_ups (id, lead_id, assigned_to, due_at, status, created_by, created_at)
           values (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(id, o.leadId, o.assignedTo, o.dueAt, o.status ?? 'PENDING', o.assignedTo, Date.now());
      return id;
    },
    async call(cookie, method, url, body) {
      const r = req(url, { method, body, cookie: cookie ?? undefined, headers: { host: 'localhost' } });
      const leadPost = /^\/api\/leads\/([^/]+)\/follow-ups$/.exec(url);
      if (leadPost) return post(r as never, { params: { id: leadPost[1]! } });
      const item = /^\/api\/follow-ups\/([^/?]+)$/.exec(url);
      if (item) return patch(r as never, { params: { id: item[1]! } });
      return list(r as never);
    },
  };
}
