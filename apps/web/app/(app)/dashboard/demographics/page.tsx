import { redirect } from 'next/navigation';
import { asc } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { teams } from '@/server/db/schema';
import { getCurrentUser } from '@/server/auth/get-current-user';
import { can, getScope } from '@/server/policy';
import { DemographicsTab } from '@/components/dashboard/demographics/DemographicsTab';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Demographics · Lead Desk' };

export default async function DemographicsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/dashboard/demographics');
  // REP (no demographics:read) falls back to the default dashboard tab.
  if (!(await can(user, 'demographics:read'))) redirect('/dashboard');
  const scope = await getScope(user.id);
  const teamOptions = scope.isOrgWide
    ? db.select({ id: teams.id, name: teams.name }).from(teams).orderBy(asc(teams.name)).all()
    : [];
  return (
    <div className="space-y-4 p-4">
      <h1 className="text-lg font-semibold">Demographics</h1>
      <DemographicsTab teams={teamOptions} />
    </div>
  );
}
