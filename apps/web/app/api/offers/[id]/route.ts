import { NextResponse } from 'next/server';
import { OfferPatchSchema } from '@leaddesk/shared';
import { withAuthz } from '@/server/policy';
import { deleteOffer, updateOffer } from '@/server/services/offer-matcher';
import { readJson } from '../_lib';

type Params = { id: string };

export const PATCH = withAuthz<Params>(
  async ({ user, req, params }) => {
    const patch = OfferPatchSchema.parse(await readJson(req));
    return NextResponse.json({ offer: await updateOffer(params.id, patch, user.id) });
  },
  { action: 'offer:manage' },
);

export const DELETE = withAuthz<Params>(
  async ({ user, params }) => {
    await deleteOffer(params.id, user.id);
    return new Response(null, { status: 204 });
  },
  { action: 'offer:manage' },
);
