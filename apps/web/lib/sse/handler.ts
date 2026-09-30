import type { CurrentUser } from '@/server/auth/session';
import type { Hub } from './hub';
import type { FilterScope } from './filter';

export const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
};

export type EventsDeps = {
  getUser: (req: Request) => Promise<CurrentUser | null>;
  getHub: () => Hub;
  loadScope: (userId: string) => Promise<FilterScope | null>;
};

export async function handleEvents(req: Request, deps: EventsDeps): Promise<Response> {
  const user = await deps.getUser(req);
  if (!user) return new Response(null, { status: 401 });
  const scope = await deps.loadScope(user.id);
  if (!scope) return new Response(null, { status: 401 });

  const hub = deps.getHub();
  const encoder = new TextEncoder();
  let dispose: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const conn = hub.connect({
        userId: user.id,
        scope,
        lastEventId: req.headers.get('last-event-id'),
        write: (frame) => controller.enqueue(encoder.encode(frame)),
        close: () => {
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        },
      });
      dispose = conn.dispose;
      req.signal.addEventListener('abort', () => dispose?.(), { once: true });
    },
    cancel() {
      dispose?.();
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}
