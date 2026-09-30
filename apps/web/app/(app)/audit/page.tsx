import { redirect } from 'next/navigation';
import { sql } from 'drizzle-orm';
import { getCurrentUser } from '@/server/auth/get-current-user';
import { db } from '@/server/db/client';
import { can, getScope } from '@/server/policy';
import { AuditPage } from '@/components/audit/AuditPage';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/audit');
  if (!(await can(user, 'audit:read'))) {
    return (
      <div className="mx-auto max-w-xl p-10 text-center" role="alert">
        <h1 className="text-xl font-semibold">403 · Not allowed</h1>
        <p className="text-sm text-muted-foreground">
          The audit log is available to managers and VPs.
        </p>
      </div>
    );
  }
  const scope = await getScope(user.id);
  const actors =
    scope.isOrgWide
      ? db.all<{ id: string; name: string }>(sql`SELECT id, name FROM users ORDER BY name`)
      : db.all<{ id: string; name: string }>(
          sql`SELECT id, name FROM users WHERE id IN (${sql.join(
            [...scope.userIds].map((i) => sql`${i}`),
            sql`, `,
          )}) ORDER BY name`,
        );
  return <AuditPage actors={actors} />;
}
