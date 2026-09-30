import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/server/auth/get-current-user';
import { can } from '@/server/policy';
import { listOffers } from '@/server/services/offer-matcher';
import { OffersTable } from '@/components/offers/OffersTable';

export const dynamic = 'force-dynamic';

/** VP sees and manages every offer; everyone else sees active and scheduled offers read-only. */
export default async function OffersPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/offers');

  const canManage = await can(user, 'offer:manage');
  const initialOffers = await listOffers(canManage ? 'all' : 'visible');

  return <OffersTable canManage={canManage} initialOffers={initialOffers} />;
}
