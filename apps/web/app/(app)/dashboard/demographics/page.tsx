import { redirect } from 'next/navigation';
import { asc } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { teams } from '@/server/db/schema';
import { getCurrentUser } from '@/server/auth/get-current-user';
import { can, getScope } from '@/server/policy';
import { Forbidden } from '@/components/layout/forbidden';
import { DemographicsTab } from '@/components/dashboard/demographics/DemographicsTab';
import { DashboardTabs } from '@/components/dashboard/DashboardTabs';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Demographics' };

export default async function DemographicsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/dashboard/demographics');
  if (!(await can(user, 'demographics:read'))) return <Forbidden />;
  const scope = await getScope(user.id);
  const teamOptions = scope.isOrgWide
    ? db.select({ id: teams.id, name: teams.name }).from(teams).orderBy(asc(teams.name)).all()
    : [];
  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <DashboardTabs layout={scope.isOrgWide ? 'vp' : 'manager'} />
      <DemographicsTab teams={teamOptions} />
    </div>
  );
}
