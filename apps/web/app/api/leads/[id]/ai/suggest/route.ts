import { NextResponse } from 'next/server';
import { withAuthz } from '@/server/policy';
import { suggestForLead } from '@/server/services/ai';
import { SuggestBodySchema } from '@/server/services/ai/schemas';
import { loadLead, parseBody } from '../route-helpers';

export const dynamic = 'force-dynamic';

type Params = { id: string };

/** AI summary + next best action. Always answers: falls back to rules when the AI is unavailable. */
export const POST = withAuthz<Params>(
  async ({ req, params, user }) => {
    const body = await parseBody(req, SuggestBodySchema);
    return NextResponse.json(await suggestForLead(user, params.id, body));
  },
  { action: 'lead:read', loadResource: loadLead },
);
