'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Channel } from '@leaddesk/shared';
import { apiFetch } from '@/lib/api-client';
import type { DraftResponse, SuggestResponse } from '@/server/services/ai/schemas';

export type DraftChannel = Exclude<Channel, 'CALL'>;

export const suggestKey = (leadId: string, version: number, lastActivityAt: number | null) =>
  ['ai', 'suggest', leadId, version, lastActivityAt] as const;
export const draftKey = (leadId: string, channel: DraftChannel, version: number, lastActivityAt: number | null) =>
  ['ai', 'draft', leadId, channel, version, lastActivityAt] as const;

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await apiFetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`AI request failed (${res.status})`);
  return (await res.json()) as T;
}

export const fetchSuggest = (leadId: string, regenerate = false) =>
  post<SuggestResponse>(`/api/leads/${leadId}/ai/suggest`, regenerate ? { regenerate: true } : {});
export const fetchDraft = (leadId: string, channel: DraftChannel, regenerate = false) =>
  post<DraftResponse>(`/api/leads/${leadId}/ai/draft`, { channel, ...(regenerate ? { regenerate: true } : {}) });

export async function sendFeedback(
  leadId: string,
  kind: 'suggest' | 'draft',
  fingerprint: string,
  vote: 'up' | 'down',
): Promise<void> {
  await post(`/api/leads/${leadId}/ai/feedback`, { kind, fingerprint, vote }).catch(() => undefined);
}

/** Suggestion for the lead; the key includes version + last activity so new activity refetches. */
export function useSuggest(leadId: string, version: number, lastActivityAt: number | null, enabled = true) {
  return useQuery({
    queryKey: suggestKey(leadId, version, lastActivityAt),
    queryFn: () => fetchSuggest(leadId),
    enabled,
    staleTime: Infinity,
    retry: false,
  });
}

export function useRegenerate(leadId: string) {
  const qc = useQueryClient();
  return async (key: readonly unknown[], kind: 'suggest' | 'draft', channel?: DraftChannel) => {
    const fresh = kind === 'suggest' ? await fetchSuggest(leadId, true) : await fetchDraft(leadId, channel!, true);
    qc.setQueryData(key, fresh);
  };
}

export function minutesAgo(ts: number, now = Date.now()): number {
  return Math.max(0, Math.round((now - ts) / 60_000));
}
