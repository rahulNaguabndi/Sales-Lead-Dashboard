'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { tabsFor } from './tabs';

/** Filters both dashboard tabs understand; they travel with the tab links (F17 FR-007). */
const SHARED_KEYS = ['range', 'from', 'to', 'teamId', 'sourceGroup'] as const;

/**
 * Overview / Demographics tab bar as real links, rendered on both pages so either can be
 * opened directly and the date range, team and source filters carry over.
 */
export function DashboardTabs({ layout }: { layout: string }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const tabs = tabsFor(layout);
  if (tabs.length < 2) return null;
  const shared = new URLSearchParams();
  for (const k of SHARED_KEYS) {
    const v = search.get(k);
    if (v) shared.set(k, v);
  }
  const qs = shared.toString();
  return (
    <nav aria-label="Dashboard views" className="flex gap-2 border-b">
      {tabs.map((t) => {
        const href = t.href ?? '/dashboard';
        const current = pathname === href;
        return (
          <Link
            key={t.id}
            href={qs ? `${href}?${qs}` : href}
            aria-current={current ? 'page' : undefined}
            className={`px-3 py-1 text-sm ${current ? 'border-b-2 border-primary font-medium' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
