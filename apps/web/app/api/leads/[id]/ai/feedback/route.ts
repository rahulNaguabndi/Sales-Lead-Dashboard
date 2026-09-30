import { withAuthz } from '@/server/policy';
import { FeedbackBodySchema } from '@/server/services/ai/schemas';
import { loadLead, parseBody } from '../route-helpers';

export const dynamic = 'force-dynamic';

type Params = { id: string };

/** 👍/👎 on an AI result. Logged only (ids and vote, never content); no table needed. */
export const POST = withAuthz<Params>(
  async ({ req, params }) => {
    const { kind, fingerprint, vote } = await parseBody(req, FeedbackBodySchema);
    process.stdout.write(
      `${JSON.stringify({ level: 'info', message: 'ai feedback', leadId: params.id, kind, fingerprint, vote })}\n`,
    );
    return new Response(null, { status: 204 });
  },
  { action: 'lead:read', loadResource: loadLead },
);
