'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import type { LeadDeskEvent, LeadSummary } from '@leaddesk/shared';
import { createInvalidator } from './invalidation';
import { liveStore, type LiveState } from './liveStore';
import { decideToast, type ToastDecision } from './toast-rules';

const EVENT_TYPES = [
  'lead.created',
  'lead.assigned',
  'lead.updated',
  'activity.created',
  'followup.due',
  'offer.changed',
] as const;

const POLL_MS = 30_000;
const summaries = new Map<string, LeadSummary>();

export function useLiveState(): LiveState {
  return useSyncExternalStore(liveStore.subscribe, liveStore.getState, liveStore.getState);
}

/** True while offline > 60 s: consumers may poll every 30 s. */
export function useLivePollingInterval(): number | false {
  return useLiveState().status === 'offline' ? POLL_MS : false;
}

type Options = {
  userId: string;
  onToast: (d: NonNullable<ToastDecision>) => void;
  onEvent?: (e: LeadDeskEvent) => void;
};

/** Opens the SSE stream once and feeds the store, query invalidation and toasts. */
export function useLiveEvents({ userId, onToast, onEvent }: Options): void {
  const client = useQueryClient();
  const router = useRouter();

  useEffect(() => {
    const inv = createInvalidator(client);
    let es: EventSource | null = null;
    let closed = false;
    let ticker: ReturnType<typeof setInterval> | null = null;

    const handle = (e: LeadDeskEvent) => {
      if (e.type === 'lead.created') summaries.set(e.lead.id, e.lead);
      inv.handle(e);
      if (e.type === 'lead.created' || e.type === 'lead.assigned' || e.type === 'lead.updated') {
        const id = e.type === 'lead.created' ? e.lead.id : e.leadId;
        liveStore.highlight(id);
        setTimeout(() => liveStore.expire(), 5100);
      }
      if ('leadId' in e && e.by && e.by !== userId) {
        const who = (e as { byName?: string }).byName ?? 'a colleague';
        liveStore.noteUpdatedBy(e.leadId, who);
      }
      const decision = decideToast(e, userId, summaries);
      if (decision) onToast(decision);
      onEvent?.(e);
      // Server-rendered lead detail: refresh its data when the open lead changes.
      if (e.type === 'lead.updated' || e.type === 'activity.created' || e.type === 'lead.assigned')
        if (location.pathname === `/leads/${e.leadId}`) router.refresh();
    };

    const probeSession = async () => {
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' });
        if (res.status === 401) router.replace('/login');
      } catch {
        /* still offline */
      }
    };

    const connect = () => {
      if (closed) return;
      es = new EventSource('/api/events');
      es.onopen = () => {
        liveStore.setStatus('live');
        inv.all();
      };
      es.onerror = () => {
        liveStore.setStatus('reconnecting');
        void probeSession();
      };
      es.addEventListener('resync', () => inv.all());
      for (const t of EVENT_TYPES)
        es.addEventListener(t, (m) => {
          try {
            handle(JSON.parse((m as MessageEvent<string>).data) as LeadDeskEvent);
          } catch {
            /* ignore malformed frame */
          }
        });
    };

    connect();
    ticker = setInterval(() => {
      liveStore.tick();
      if (liveStore.shouldPoll()) inv.all();
    }, POLL_MS);
    const offlineCheck = setInterval(() => liveStore.tick(), 5000);

    return () => {
      closed = true;
      es?.close();
      if (ticker) clearInterval(ticker);
      clearInterval(offlineCheck);
      inv.dispose();
    };
  }, [client, router, userId, onToast, onEvent]);
}
