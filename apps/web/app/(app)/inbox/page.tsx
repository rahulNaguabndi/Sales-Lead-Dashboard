import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/server/auth/get-current-user';
import { inboxCaps, listLeads, listScopeOwners } from '@/server/services/lead-query';
import { db } from '@/server/db/client';
import { teams } from '@/server/db/schema';
import { getScope } from '@/server/policy';
import { InboxView } from '@/components/leads/inbox/InboxView';
import { lenientParams, toQueryString } from '@/components/leads/inbox/inbox-params';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Inbox' };

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/inbox');

  // Bad params are ignored and defaults shown (spec section 5).
  const params = lenientParams(searchParams);
  const scope = await getScope(user.id);
  const [initialData, owners, caps] = await Promise.all([
    listLeads(user, params),
    listScopeOwners(user),
    inboxCaps(user, scope, db),
  ]);
  const teamOptions = db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .all()
    .filter((t) => scope.isOrgWide || scope.teamIds.has(t.id));

  return (
    <InboxView
      caps={caps}
      initialData={initialData}
      initialKey={toQueryString(params)}
      owners={owners}
      teams={teamOptions}
    />
  );
}
