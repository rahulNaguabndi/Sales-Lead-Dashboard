'use client';

import { useCallback, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { QueryClient, QueryClientProvider, useInfiniteQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { AuditFilterBar } from './AuditFilterBar';
import { AuditTable } from './AuditTable';
import { FILTER_KEYS, type AuditFilterState, type AuditPageDto } from './types';

type Actor = { id: string; name: string };

function AuditInner({ actors }: { actors: Actor[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const filters = useMemo(() => {
    const f: AuditFilterState = {};
    for (const k of FILTER_KEYS) {
      const v = params.get(k);
      if (v) f[k] = v;
    }
    return f;
  }, [params]);

  const onChange = useCallback(
    (next: AuditFilterState) => {
      const p = new URLSearchParams();
      for (const k of FILTER_KEYS) if (next[k]) p.set(k, next[k]!);
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname],
  );

  const q = useInfiniteQuery({
    queryKey: ['audit', filters],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const p = new URLSearchParams(filters as Record<string, string>);
      if (pageParam) p.set('cursor', pageParam);
      const res = await apiFetch(`/api/audit?${p.toString()}`);
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as AuditPageDto;
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">Audit log</h1>
      <AuditFilterBar value={filters} onChange={onChange} actors={actors} />
      <AuditTable
        items={items}
        loading={q.isLoading}
        error={q.isError}
        hasMore={!!q.hasNextPage}
        loadingMore={q.isFetchingNextPage}
        onLoadMore={() => q.fetchNextPage()}
        onRetry={() => q.refetch()}
      />
    </div>
  );
}

export function AuditPage({ actors }: { actors: Actor[] }) {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <AuditInner actors={actors} />
    </QueryClientProvider>
  );
}
