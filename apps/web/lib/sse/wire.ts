import type { LeadDeskEvent } from '@leaddesk/shared';

export const RETRY_MS = 3000;
export const HEARTBEAT_MS = 25_000;
export const PING_FRAME = ': ping\n\n';

export const retryFrame = (): string => `retry: ${RETRY_MS}\n\n`;

export const helloFrame = (userId: string, serverTime: number): string =>
  `event: hello\ndata: ${JSON.stringify({ userId, serverTime })}\n\n`;

export const resyncFrame = (): string => 'event: resync\ndata: {}\n\n';

export const eventFrame = (id: string, event: LeadDeskEvent): string =>
  `id: ${id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
