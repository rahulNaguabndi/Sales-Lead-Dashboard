'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatOfferValue } from '@leaddesk/shared';
import type { LeadSlotProps } from '@/components/leads/detail/types';
import { fetchLeadOffers, leadOffersKey, type LeadOfferDTO } from './offers-api';
import { formatUntil } from './offer-format';

type Props = Pick<LeadSlotProps, 'lead'> & {
  /** Provided by F14 when its template picker exists; the button is hidden otherwise. */
  onUseInMessage?: (offer: LeadOfferDTO['offer']) => void;
};

export function OffersPanel({ lead, onUseInMessage }: Props) {
  // Key prefix ['lead'] is invalidated by the live provider on offer.changed (F12).
  const query = useQuery({
    queryKey: leadOffersKey(lead.id),
    queryFn: () => fetchLeadOffers(lead.id),
    staleTime: 15_000,
  });

  return (
    <Card aria-label="Offers for this lead">
      <CardHeader>
        <CardTitle className="text-base">Offers</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {query.isPending && (
          <div role="status" aria-label="Loading offers" className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}
        {query.isError && (
          <div role="alert" className="space-y-2">
            <p className="text-muted-foreground">Offers could not be loaded.</p>
            <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
              Retry
            </Button>
          </div>
        )}
        {query.isSuccess && query.data.length === 0 && (
          <p className="text-muted-foreground">
            No offers apply to this lead.{' '}
            <Link href="/offers" className="underline underline-offset-2">
              See all offers
            </Link>
          </p>
        )}
        {query.isSuccess &&
          query.data.map(({ offer, reasons, endsSoon }) => (
            <div key={offer.id} data-testid="lead-offer" className="rounded-md border p-2.5">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium leading-snug">{offer.title}</p>
                <span className="shrink-0 rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-semibold text-green-400">
                  {formatOfferValue(offer)}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                until {formatUntil(offer.validTo)}
                {endsSoon && (
                  <span className="ml-2 rounded-full bg-amber-500/15 px-1.5 py-0.5 font-semibold text-amber-400">
                    Ends soon
                  </span>
                )}
              </p>
              <ul className="mt-1.5 flex flex-wrap gap-1" aria-label="Why it applies">
                {reasons.map((r) => (
                  <li key={r} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                    {r}
                  </li>
                ))}
              </ul>
              {onUseInMessage && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={() => onUseInMessage(offer)}
                >
                  Use in message
                </Button>
              )}
            </div>
          ))}
      </CardContent>
    </Card>
  );
}
