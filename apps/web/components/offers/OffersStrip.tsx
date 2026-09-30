'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Flame } from 'lucide-react';
import { formatOfferValue } from '@leaddesk/shared';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { fetchOffers, offersKey } from './offers-api';
import { formatUntil } from './offer-format';

/** Top-bar strip: count of active offers with a popover list. Hidden state is never "0 error". */
export function OffersStrip() {
  // offer.changed invalidates ['offers'] (F12 live provider); otherwise refetch every 30 s and on focus.
  const query = useQuery({
    queryKey: offersKey('active'),
    queryFn: () => fetchOffers('active'),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  });
  const offers = query.data ?? [];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="offers-strip"
          aria-label={`Active offers: ${query.isSuccess ? offers.length : 'loading'}`}
          className="flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-slate-200 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Flame className="h-4 w-4 text-orange-400" aria-hidden />
          <span data-testid="offers-strip-count">{query.isSuccess ? offers.length : '-'}</span>
          <span className="hidden text-xs text-slate-400 md:inline">offers</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-2">
        <div className="max-h-80 overflow-y-auto" data-testid="offers-strip-list">
          {query.isError && (
            <p className="p-2 text-sm text-muted-foreground">Offers unavailable.</p>
          )}
          {query.isSuccess && offers.length === 0 && (
            <p className="p-2 text-sm text-muted-foreground">No active offers right now.</p>
          )}
          <ul className="space-y-1">
            {offers.map((o) => (
              <li key={o.id} className="rounded-md p-2 text-sm hover:bg-muted">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium leading-snug">{o.title}</span>
                  <span className="shrink-0 rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-semibold text-green-400">
                    {formatOfferValue(o)}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  until {formatUntil(o.validTo)}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <Link
          href="/offers"
          className="mt-1 block rounded-md p-2 text-center text-sm text-blue-400 hover:bg-muted"
        >
          All offers
        </Link>
      </PopoverContent>
    </Popover>
  );
}
