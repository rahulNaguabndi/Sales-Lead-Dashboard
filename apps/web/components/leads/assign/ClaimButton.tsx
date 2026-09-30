'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-client';
import { useRefresh } from './useRefresh';

/** Claims a pool lead. `onDone` lets list views drop the row immediately. */
export function ClaimButton({
  leadId,
  onDone,
  size = 'sm',
}: {
  leadId: string;
  onDone?: (claimed: boolean) => void;
  size?: 'sm' | 'default';
}) {
  const refresh = useRefresh();
  const [busy, setBusy] = useState(false);

  async function claim() {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/leads/${leadId}/claim`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      if (res.ok) {
        toast.success('Lead claimed');
        onDone?.(true);
      } else {
        const { error } = await res.json().catch(() => ({ error: null }));
        if (error?.code === 'ALREADY_ASSIGNED') toast.error(`${error.message} a moment ago`);
        else toast.error(error?.message ?? 'Could not claim this lead');
        onDone?.(false);
      }
      refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      size={size}
      disabled={busy}
      data-testid="claim-button"
      onClick={(e) => {
        e.stopPropagation();
        void claim();
      }}
    >
      Claim
    </Button>
  );
}
