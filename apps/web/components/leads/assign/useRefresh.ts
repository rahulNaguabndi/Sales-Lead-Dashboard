import { useContext } from 'react';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { invalidateLeadData } from '@/lib/lead-cache';
import { getSharedQueryClient } from '@/lib/sse/queryClient';

/**
 * Refreshes everything an assignment can change: TanStack Query caches (inbox, board, pipeline,
 * dashboard, follow-ups) and server components via `router.refresh()` when the App Router is
 * mounted (a no-op elsewhere, e.g. server-render tests). `router.refresh()` alone left the
 * client-cached inbox stale until an SSE event arrived.
 */
export function useRefresh(): (leadId?: string) => void {
  const router = useContext(AppRouterContext);
  return (leadId) => {
    if (typeof window !== 'undefined') invalidateLeadData(getSharedQueryClient(), leadId);
    router?.refresh();
  };
}
