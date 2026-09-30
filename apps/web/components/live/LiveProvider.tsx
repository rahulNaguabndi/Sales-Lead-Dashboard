'use client';

import { useCallback, useRef, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { getSharedQueryClient } from '@/lib/sse/queryClient';
import { useLiveEvents } from '@/lib/sse/useLiveEvents';
import { shouldGroupPool, type ToastDecision } from '@/lib/sse/toast-rules';

const MAX_VISIBLE = 3;

function Live({ userId, children }: { userId: string; children: ReactNode }) {
  const router = useRouter();
  const poolArrivals = useRef<number[]>([]);

  const onToast = useCallback(
    (d: NonNullable<ToastDecision>) => {
      const open = () => router.push(`/leads/${d.leadId}`);
      if (d.kind === 'assigned-to-me') {
        const s = d.summary;
        const title = s
          ? `${d.hot ? '🔥 ' : ''}New lead: ${s.customerName}`
          : 'Lead assigned to you';
        const description = s ? [s.vehicleModel, s.source].filter(Boolean).join(' · ') : undefined;
        toast(title, {
          description,
          duration: d.durationMs,
          className: d.hot ? 'border-l-4 border-l-red-500' : undefined,
          action: { label: 'Open', onClick: open },
          cancel: { label: 'Dismiss', onClick: () => undefined },
        });
      } else if (d.kind === 'pool') {
        const now = Date.now();
        poolArrivals.current = [...poolArrivals.current.filter((t) => now - t <= 10_000), now];
        if (shouldGroupPool(poolArrivals.current, now))
          toast.info(`${poolArrivals.current.length} new leads in the pool`, {
            id: 'pool-group',
            duration: 5000,
            action: { label: 'Open inbox', onClick: () => router.push('/inbox') },
          });
        else
          toast.info(`New pool lead: ${d.summary.customerName}`, {
            duration: 4000,
            action: { label: 'Open', onClick: open },
          });
      } else if (d.kind === 'reassigned-away') {
        toast.info('A lead was reassigned away from you', { duration: 5000 });
      } else {
        toast('Follow-up due', { duration: 8000, action: { label: 'Open', onClick: open } });
      }
      // The app Toaster (sonner) caps visibility; keep the cap explicit.
      void MAX_VISIBLE;
    },
    [router],
  );

  useLiveEvents({ userId, onToast });
  return <>{children}</>;
}

/** Mounts the shared QueryClient and the single SSE connection for the authenticated app. */
export function LiveProvider({ userId, children }: { userId: string; children: ReactNode }) {
  return (
    <QueryClientProvider client={getSharedQueryClient()}>
      <Live userId={userId}>{children}</Live>
    </QueryClientProvider>
  );
}
