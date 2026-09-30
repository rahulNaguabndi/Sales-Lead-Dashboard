'use client';

import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { bestTimeHint } from '@leaddesk/shared';
import type { BestTime } from '@leaddesk/shared';
import type { LeadSlotProps } from '@/components/leads/detail/types';

/** Rendered after mount so server and client clocks never disagree during hydration. */
export function BestTimeHint({ customer }: Pick<LeadSlotProps, 'customer'>) {
  const [hint, setHint] = useState<string | null>(null);
  useEffect(() => {
    setHint(
      bestTimeHint(
        customer.bestTime as BestTime,
        customer.country,
        customer.city ?? customer.country,
      ),
    );
  }, [customer.bestTime, customer.country, customer.city]);
  if (!hint) return null;
  return (
    <p className="flex items-center gap-1.5 text-xs text-amber-400" data-testid="best-time-hint">
      <Clock aria-hidden className="h-3 w-3" />
      {hint}
    </p>
  );
}
