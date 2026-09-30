import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { leads } from '@/server/db/schema';
import { withAuthz } from '@/server/policy';
import { getOffersForLead } from '@/server/services/offer-matcher';

type Params = { id: string };

/** Offers the lead is eligible for. lead:read decides visibility (out-of-scope leads answer 404 per policy). */
export const GET = withAuthz<Params>(
  async ({ params }) => NextResponse.json({ offers: await getOffersForLead(params.id) }),
  {
    action: 'lead:read',
    loadResource: async ({ id }) => {
      const lead = db.select().from(leads).where(eq(leads.id, id)).get();
      return lead ? { kind: 'lead', lead } : undefined;
    },
  },
);
