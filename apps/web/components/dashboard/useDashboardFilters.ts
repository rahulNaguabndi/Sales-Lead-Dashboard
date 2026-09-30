'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { DashboardFilterSchema, type DashboardFilters } from '@leaddesk/shared';

const DEFAULT: DashboardFilters = { range: '30d' };

/** Filter state lives in the URL; invalid params fall back to the default (Last 30 days). */
export function useDashboardFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params.toString();

  const filters = useMemo<DashboardFilters>(() => {
    const parsed = DashboardFilterSchema.safeParse(Object.fromEntries(new URLSearchParams(raw)));
    return parsed.success ? parsed.data : DEFAULT;
  }, [raw]);

  const setFilters = useCallback(
    (patch: Partial<DashboardFilters>) => {
      const next = { ...filters, ...patch };
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries(next)) if (v) sp.set(k, String(v));
      router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
    },
    [filters, pathname, router],
  );

  const query = useMemo(() => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) sp.set(k, String(v));
    return sp.toString();
  }, [filters]);

  return { filters, setFilters, query };
}
