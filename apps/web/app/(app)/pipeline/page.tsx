import { redirect } from 'next/navigation';
import { canReopen } from '@leaddesk/shared';
import { getCurrentUser } from '@/server/auth/get-current-user';
import { listScopeOwners } from '@/server/services/lead-query';
import { KanbanBoard } from '@/components/leads/stage/KanbanBoard';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Pipeline · Lead Desk' };

export default async function PipelinePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/pipeline');
  const owners = canReopen(user.role) ? await listScopeOwners(user) : [];
  return <KanbanBoard role={user.role} owners={owners.map((o) => ({ id: o.id, name: o.name }))} />;
}
