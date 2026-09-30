'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  clearFilters,
  lenientParams,
  patchParams,
  toQueryString,
  type InboxParams,
} from './inbox-params';

/** URL search params as inbox state (FR-010). Bad params are ignored; updates use router.replace. */
export function useInboxParams() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const serialized = search.toString();
  const params = useMemo(() => lenientParams(new URLSearchParams(serialized)), [serialized]);

  const push = useCallback(
    (next: InboxParams) => {
      const qs = toQueryString(next);
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  const patch = useCallback(
    (p: Record<string, string | undefined>) => push(patchParams(params, p)),
    [params, push],
  );
  const clear = useCallback(() => push(clearFilters(params)), [params, push]);

  return { params, patch, clear };
}
