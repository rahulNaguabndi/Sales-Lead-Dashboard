import { NextResponse, type NextRequest } from 'next/server';
import { IntakeLeadSchema } from '@leaddesk/shared';
import { AppError, toErrorResponse } from '@/server/http/errors';
import { ingest } from '@/server/services/intake';
import { matchApiKey } from '../_lib/api-key';
import { byteLength, isJson, MAX_BODY_BYTES, tooLarge } from '../_lib/body';
import { clientIp } from '../_lib/client-ip';
import { corsHeaders } from '../_lib/cors';
import { checkRateLimit } from '../_lib/rate-limit';
import { errorJson } from '../_lib/respond';

export const dynamic = 'force-dynamic';

export function OPTIONS(req: NextRequest): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(req.headers.get('origin'), true),
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const cors = corsHeaders(req.headers.get('origin'));
  try {
    if (!isJson(req.headers.get('content-type'))) {
      return errorJson(
        415,
        'UNSUPPORTED_MEDIA_TYPE',
        'Content-Type must be application/json',
        cors,
      );
    }
    if (tooLarge(req.headers.get('content-length'))) {
      return errorJson(
        413,
        'PAYLOAD_TOO_LARGE',
        `Body must be at most ${MAX_BODY_BYTES} bytes`,
        cors,
      );
    }
    const keyName = matchApiKey(req.headers.get('x-api-key'));
    if (!keyName) return errorJson(401, 'UNAUTHORIZED_CLIENT', 'Missing or unknown API key', cors);

    const ip = clientIp(req.headers);
    const retryAfter = await checkRateLimit(keyName, ip);
    if (retryAfter !== null) {
      return errorJson(429, 'RATE_LIMITED', 'Too many requests', {
        ...cors,
        'Retry-After': String(retryAfter),
      });
    }

    const text = await req.text();
    if (byteLength(text) > MAX_BODY_BYTES) {
      return errorJson(
        413,
        'PAYLOAD_TOO_LARGE',
        `Body must be at most ${MAX_BODY_BYTES} bytes`,
        cors,
      );
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return errorJson(400, 'VALIDATION_ERROR', 'Body is not valid JSON', cors, {
        _: 'Invalid JSON',
      });
    }
    const parsed = IntakeLeadSchema.safeParse(json);
    if (!parsed.success) {
      const { status, body } = toErrorResponse(parsed.error);
      return NextResponse.json(body, { status, headers: cors });
    }
    if (parsed.data.website) {
      console.warn(JSON.stringify({ level: 'warn', msg: 'intake_honeypot', apiKey: keyName }));
      return NextResponse.json({ status: 'accepted' }, { status: 202, headers: cors });
    }

    const result = await ingest(parsed.data, {
      apiKeyName: keyName,
      ip,
      idempotencyKey: req.headers.get('idempotency-key') ?? undefined,
    });
    return NextResponse.json(
      {
        reference: result.reference,
        status: result.kind,
        assignedTo: result.assignedFirstName ? { firstName: result.assignedFirstName } : null,
        expectedContact: result.expectedContact,
      },
      { status: result.kind === 'created' ? 201 : 200, headers: cors },
    );
  } catch (err) {
    if (err instanceof AppError) {
      const { status, body } = toErrorResponse(err);
      return NextResponse.json(body, { status, headers: cors });
    }
    console.error(
      JSON.stringify({ level: 'error', msg: 'intake_failed', error: (err as Error).message }),
    );
    return errorJson(500, 'INTERNAL', 'Internal server error', cors);
  }
}
