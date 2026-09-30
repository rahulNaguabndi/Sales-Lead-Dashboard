'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { STAGE_LABELS, type Stage, type StageChange } from '@leaddesk/shared';
import { apiFetch } from '@/lib/api-client';

export type StageResult =
  | { ok: true; lead: { id: string; stage: Stage; version: number } }
  | { ok: false; status: number; code: string; message: string; conflict: boolean };

export type StageRequest = StageChange;

/** PATCH /api/leads/:id/stage. Never throws; returns a typed result. */
export async function patchStage(leadId: string, body: StageRequest): Promise<StageResult> {
  try {
    const res = await apiFetch(`/api/leads/${leadId}/stage`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (res.ok) return { ok: true, lead: json.lead };
    const err = json?.error ?? {};
    return {
      ok: false,
      status: res.status,
      code: err.code ?? 'ERROR',
      message: err.message ?? 'Could not change the stage',
      conflict: res.status === 409,
    };
  } catch {
    return { ok: false, status: 0, code: 'NETWORK', message: 'Network error', conflict: false };
  }
}

/** Toasts the outcome of a stage change (success "Moved to …", 409 "Refreshed", 422/403 reason). */
export function announce(result: StageResult, to: Stage): void {
  if (result.ok) {
    toast.success(`Moved to ${STAGE_LABELS[to]}`);
  } else if (result.conflict) {
    toast.error(result.message);
  } else {
    toast.error(result.message);
  }
}

/** Stage change for the detail page: toasts, then refreshes server data and cached queries. */
export function useStageMutation(leadId: string) {
  const router = useRouter();
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);

  const refresh = useCallback(() => {
    router.refresh();
    void qc.invalidateQueries({ queryKey: ['lead', leadId] });
    void qc.invalidateQueries({ queryKey: ['leads'] });
    void qc.invalidateQueries({ queryKey: ['pipeline'] });
  }, [router, qc, leadId]);

  const mutate = useCallback(
    async (body: StageRequest): Promise<StageResult> => {
      setPending(true);
      const result = await patchStage(leadId, body);
      setPending(false);
      announce(result, body.to);
      if (result.ok || result.conflict) refresh();
      return result;
    },
    [leadId, refresh],
  );

  return { mutate, pending };
}
