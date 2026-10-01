import { redirect } from 'next/navigation';
import { can } from '@/server/policy';
import { Forbidden } from '@/components/layout/forbidden';
import { getCurrentUser } from '@/server/auth/get-current-user';
import { getTeamSettings } from '@/server/services/assignment';
import { TeamSettingsCard } from '@/components/leads/assign/TeamSettingsCard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Team settings' };

export default async function TeamSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/team/settings');
  if (!(await can(user, 'user:list'))) return <Forbidden />;
  const teams = await getTeamSettings(user);
  return (
    <div className="space-y-4 p-4 lg:p-6">
      <h1 className="text-xl font-semibold">Team settings</h1>
      {teams.map((t) => (
        <TeamSettingsCard key={t.id} team={t} />
      ))}
    </div>
  );
}
