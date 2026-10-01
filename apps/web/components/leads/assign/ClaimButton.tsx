'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-client';
import { applyOptimisticClaim } from '@/lib/lead-cache';
import { getSharedQueryClient } from '@/lib/sse/queryClient';
import { useCurrentUser } from '@/components/layout/current-user';
import { useRefresh } from './useRefresh';

/**
 * Claims a pool lead. The row leaves "Unassigned" and the counts move immediately (optimistic);
 * a failure is rolled back by the refetch. `onDone` lets list views react as well.
 */
export function ClaimButton({
  leadId,
  customerName,
  onDone,
  size = 'sm',
}: {
  leadId: string;
  /** Gives every Claim button a distinct accessible name. */
  customerName?: string;
  onDone?: (claimed: boolean) => void;
  size?: 'sm' | 'default';
}) {
  const refresh = useRefresh();
  const me = useCurrentUser();
  const [state, setState] = useState<'idle' | 'busy' | 'claimed'>('idle');

  async function claim() {
    setState('busy');
    const client = getSharedQueryClient();
    await client.cancelQueries({ queryKey: ['leads'] });
    if (me) applyOptimisticClaim(client, leadId, me);
    try {
      const res = await apiFetch(`/api/leads/${leadId}/claim`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      if (res.ok) {
        setState('claimed');
        toast.success(customerName ? `${customerName} is now yours` : 'Lead claimed');
        onDone?.(true);
      } else {
        setState('idle');
        const { error } = await res.json().catch(() => ({ error: null }));
        if (error?.code === 'ALREADY_ASSIGNED') toast.error(`${error.message} a moment ago`);
        else toast.error(error?.message ?? 'Could not claim this lead');
        onDone?.(false);
      }
    } catch {
      setState('idle');
      toast.error('Could not claim this lead');
      onDone?.(false);
    } finally {
      refresh(leadId);
    }
  }

  return (
    <Button
      size={size}
      disabled={state !== 'idle'}
      data-testid="claim-button"
      aria-label={customerName ? `Claim lead for ${customerName}` : undefined}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        void claim();
      }}
    >
      {state === 'busy' ? 'Claiming…' : state === 'claimed' ? 'Claimed' : 'Claim'}
    </Button>
  );
}
