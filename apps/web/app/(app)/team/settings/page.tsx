import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/server/auth/get-current-user';
import { getTeamSettings } from '@/server/services/assignment';
import { TeamSettingsCard } from '@/components/leads/assign/TeamSettingsCard';

export const dynamic = 'force-dynamic';

export default async function TeamSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/team/settings');
  const teams = await getTeamSettings(user).catch(() => notFound());
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">Team settings</h1>
      {teams.map((t) => (
        <TeamSettingsCard key={t.id} team={t} />
      ))}
    </div>
  );
}
