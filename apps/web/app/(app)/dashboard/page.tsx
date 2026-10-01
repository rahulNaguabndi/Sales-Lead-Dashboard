import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/server/auth/get-current-user';
import { db } from '@/server/db/client';
import { teams } from '@/server/db/schema';
import { can } from '@/server/policy';
import { listScopeOwners } from '@/server/services/lead-query';
import { DashboardView, type DashboardLayout } from '@/components/dashboard/DashboardView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/dashboard');

  // Layout follows the policy layer's capabilities, not role names (SC-004).
  const [org, team] = await Promise.all([can(user, 'dashboard:org'), can(user, 'dashboard:team')]);
  const layout: DashboardLayout = org ? 'vp' : team ? 'manager' : 'rep';

  const teamList = org ? db.select({ id: teams.id, name: teams.name }).from(teams).all() : [];
  const reps = layout === 'rep' ? [] : await listScopeOwners(user);

  return <DashboardView layout={layout} teams={teamList} reps={reps} />;
}
