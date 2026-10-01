import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { DetailLayout } from '@/components/leads/detail/DetailLayout';
import { getCurrentUser } from '@/server/auth/get-current-user';
import { NotFoundError } from '@/server/http/errors';
import { getLeadDetail, listActivities } from '@/server/services/lead-detail';

export const dynamic = 'force-dynamic';

type Props = { params: { id: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const user = await getCurrentUser();
  if (!user) return { title: 'Lead' };
  try {
    const { lead, customer } = await getLeadDetail(user, params.id);
    return { title: `${customer.firstName} ${customer.lastName} · ${lead.reference}` };
  } catch {
    return { title: 'Lead not found' };
  }
}

export default async function LeadDetailPage({ params }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/leads/${params.id}`)}`);

  let detail;
  let initialActivities;
  try {
    detail = await getLeadDetail(user, params.id);
    initialActivities = await listActivities(user, params.id, { order: 'desc', kind: 'ALL' });
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  return (
    <DetailLayout
      detail={detail}
      initialActivities={initialActivities}
      currentUser={{ id: user.id, name: user.name, role: user.role, teamId: user.teamId }}
    />
  );
}
