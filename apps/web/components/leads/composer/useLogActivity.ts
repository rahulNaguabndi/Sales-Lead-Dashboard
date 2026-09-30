'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ulid } from 'ulid';
import type {
  ActivityResponseDTO,
  CreateActivityInput,
  CreateActivityResponse,
} from '@leaddesk/shared';
import { apiFetch } from '@/lib/api-client';

/**
 * The subset of TanStack's QueryClient this hook needs. F05's `QueryClient` satisfies it
 * structurally; it is provided through <ActivityCacheProvider> so this feature adds no dependency.
 */
export interface ActivityCache {
  getQueriesData(filter: { queryKey: readonly unknown[] }): [readonly unknown[], unknown][];
  setQueryData(queryKey: readonly unknown[], updater: (old: unknown) => unknown): unknown;
  invalidateQueries(filter: { queryKey: readonly unknown[] }): unknown;
}

const NOOP_CACHE: ActivityCache = {
  getQueriesData: () => [],
  setQueryData: () => undefined,
  invalidateQueries: () => undefined,
};

const CacheContext = createContext<ActivityCache>(NOOP_CACHE);
export const ActivityCacheProvider = CacheContext.Provider;

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
  }
}

type Snapshot = [readonly unknown[], unknown][];

/** Returns a copy of a cached timeline value with `row` prepended (array, {items} or {pages}). */
function prepend(old: unknown, row: ActivityResponseDTO): unknown {
  if (Array.isArray(old)) return [row, ...old];
  if (old && typeof old === 'object') {
    const o = old as { items?: unknown[]; pages?: { items?: unknown[] }[] };
    if (Array.isArray(o.items)) return { ...o, items: [row, ...o.items] };
    if (Array.isArray(o.pages) && o.pages[0]?.items) {
      const [first, ...rest] = o.pages;
      return { ...o, pages: [{ ...first, items: [row, ...first!.items!] }, ...rest] };
    }
  }
  return old;
}

function replaceOptimistic(
  old: unknown,
  optimisticId: string,
  rows: ActivityResponseDTO[],
): unknown {
  const swap = (items: unknown[]) =>
    items.flatMap((i) => ((i as { id?: string }).id === optimisticId ? rows : [i]));
  if (Array.isArray(old)) return swap(old);
  if (old && typeof old === 'object') {
    const o = old as { items?: unknown[]; pages?: { items?: unknown[] }[] };
    if (Array.isArray(o.items)) return { ...o, items: swap(o.items) };
    if (Array.isArray(o.pages)) {
      return { ...o, pages: o.pages.map((p) => (p.items ? { ...p, items: swap(p.items) } : p)) };
    }
  }
  return old;
}

export type UseLogActivityOptions = {
  leadId: string;
  currentUser?: { id: string; name: string };
  onSaved?: (res: CreateActivityResponse) => void;
  onError?: (err: ApiRequestError | Error) => void;
};

/** Optimistic mutation for POST /api/leads/:id/activities (FR-007). */
export function useLogActivity({ leadId, currentUser, onSaved, onError }: UseLogActivityOptions) {
  const cache = useContext(CacheContext);
  const [isPending, setPending] = useState(false);
  const inFlight = useRef(false);
  // One id per submission attempt; reused for retries after a failure, renewed after success.
  const attemptId = useRef<string>(ulid());

  const submit = useCallback(
    async (
      input: Omit<CreateActivityInput, 'clientRequestId'>,
    ): Promise<CreateActivityResponse | null> => {
      if (inFlight.current) return null; // double-click guard
      inFlight.current = true;
      setPending(true);
      const clientRequestId = attemptId.current;
      const now = Date.now();
      const optimistic: ActivityResponseDTO = {
        id: `optimistic-${clientRequestId}`,
        leadId,
        actorId: currentUser?.id ?? null,
        actorName: currentUser?.name ?? null,
        actor: null,
        kind: 'USER',
        type: input.type,
        outcome: input.outcome ?? null,
        note: input.note.trim(),
        aiAssisted: input.aiAssisted ?? false,
        metadata: { clientRequestId, pending: true },
        createdAt: now,
      };
      const key = ['lead', leadId, 'activities'] as const;
      const snapshot: Snapshot = cache.getQueriesData({ queryKey: key });
      for (const [k] of snapshot) cache.setQueryData(k, (old) => prepend(old, optimistic));

      try {
        const res = await apiFetch(`/api/leads/${leadId}/activities`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...input, clientRequestId }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          const e = body?.error;
          throw new ApiRequestError(
            e?.message ?? 'Request failed',
            res.status,
            e?.code ?? 'INTERNAL_ERROR',
            e?.fields,
          );
        }
        const data = body as CreateActivityResponse;
        const rows = [data.activity, ...data.systemActivities].reverse();
        for (const [k] of snapshot) {
          cache.setQueryData(k, (old) => replaceOptimistic(old, optimistic.id, rows));
        }
        cache.setQueryData(['lead', leadId], (old) =>
          old && typeof old === 'object' ? patchLead(old as Record<string, unknown>, data) : old,
        );
        cache.invalidateQueries({ queryKey: ['leads'] });
        attemptId.current = ulid();
        onSaved?.(data);
        return data;
      } catch (err) {
        for (const [k, v] of snapshot) cache.setQueryData(k, () => v);
        const e = err instanceof Error ? err : new Error(String(err));
        if (!(e instanceof ApiRequestError && e.status === 409)) {
          toast.error("Couldn't save activity. Your note is kept");
        }
        onError?.(e);
        return null;
      } finally {
        inFlight.current = false;
        setPending(false);
      }
    },
    [cache, currentUser, leadId, onError, onSaved],
  );

  return { submit, isPending };
}

function patchLead(
  old: Record<string, unknown>,
  data: CreateActivityResponse,
): Record<string, unknown> {
  const patch = data.lead;
  const target = old.lead && typeof old.lead === 'object' ? 'lead' : null;
  if (target) return { ...old, lead: { ...(old.lead as object), ...patch } };
  return { ...old, ...patch };
}
