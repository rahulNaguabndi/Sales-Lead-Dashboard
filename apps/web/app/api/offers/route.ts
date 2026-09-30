import { NextResponse } from 'next/server';
import { z } from 'zod';
import { OfferInputSchema } from '@leaddesk/shared';
import { authorize, withAuthz } from '@/server/policy';
import { createOffer, listOffers } from '@/server/services/offer-matcher';
import { readJson } from './_lib';

const Query = z.object({ status: z.enum(['active', 'visible', 'all']).default('active') });

export const GET = withAuthz(
  async ({ user, scope, req }) => {
    const { status } = Query.parse(Object.fromEntries(new URL(req.url).searchParams));
    // Inactive and expired offers are VP-only (F15 US-3.5).
    if (status === 'all') await authorize(user, 'offer:manage', undefined, { scope });
    return NextResponse.json({ offers: await listOffers(status) });
  },
  { action: 'offer:read' },
);

export const POST = withAuthz(
  async ({ user, req }) => {
    const input = OfferInputSchema.parse(await readJson(req));
    return NextResponse.json({ offer: await createOffer(input, user.id) }, { status: 201 });
  },
  { action: 'offer:manage' },
);
