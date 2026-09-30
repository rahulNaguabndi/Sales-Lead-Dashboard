import { NextResponse } from 'next/server';
import { withAuthz } from '@/server/policy';
import { draftForLead } from '@/server/services/ai';
import { DraftBodySchema } from '@/server/services/ai/schemas';
import { loadLead, parseBody } from '../route-helpers';

export const dynamic = 'force-dynamic';

type Params = { id: string };

/** AI draft message in the customer's language. Nothing is sent or saved. */
export const POST = withAuthz<Params>(
  async ({ req, params, user }) => {
    const { channel, regenerate } = await parseBody(req, DraftBodySchema);
    return NextResponse.json(await draftForLead(user, params.id, channel, { regenerate }));
  },
  { action: 'lead:read', loadResource: loadLead },
);
