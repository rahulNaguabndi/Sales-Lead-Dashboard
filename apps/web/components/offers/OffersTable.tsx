'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { formatEUR, formatOfferValue } from '@leaddesk/shared';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { OfferForm } from './OfferForm';
import {
  deleteOfferRequest,
  fetchOffers,
  offersKey,
  patchOfferRequest,
  type OfferDTO,
} from './offers-api';
import { formatDay, STATUS_LABEL, STATUS_STYLE, summarizeEligibility } from './offer-format';
import type { OfferEligibilityRules } from '@leaddesk/shared';

type Props = { canManage: boolean; initialOffers: OfferDTO[] };

export function OffersTable({ canManage, initialOffers }: Props) {
  const client = useQueryClient();
  const scope = canManage ? 'all' : 'visible';
  // Key prefix ['offers'] is invalidated by F12's live provider on offer.changed.
  const query = useQuery({
    queryKey: offersKey(scope),
    queryFn: () => fetchOffers(scope),
    initialData: initialOffers,
    staleTime: 10_000,
  });
  const [editing, setEditing] = useState<OfferDTO | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ['offers'] }),
      client.invalidateQueries({ queryKey: ['lead'] }),
    ]);

  async function run(id: string, action: () => Promise<unknown>, ok: string) {
    setBusyId(id);
    try {
      await action();
      await refresh();
      toast.success(ok);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusyId(null);
    }
  }

  const offers = query.data ?? [];

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Offers</h2>
          <p className="text-sm text-muted-foreground">
            {canManage
              ? 'Create and manage promotions. Reps see active offers on matching leads.'
              : 'Current and upcoming promotions.'}
          </p>
        </div>
        {canManage && (
          <Button
            onClick={() => {
              setEditing(undefined);
              setFormOpen(true);
            }}
          >
            New offer
          </Button>
        )}
      </div>

      {query.isError && (
        <p role="alert" className="text-sm text-red-400">
          Offers could not be refreshed.
        </p>
      )}
      {query.isFetching && offers.length === 0 && <Skeleton className="h-24 w-full" />}
      {offers.length === 0 && !query.isFetching ? (
        <p className="text-sm text-muted-foreground">No offers yet.</p>
      ) : (
        <Table data-testid="offers-table">
          <TableHeader>
            <TableRow>
              <TableHead>Offer</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Valid</TableHead>
              <TableHead>Who is eligible</TableHead>
              <TableHead>Performance</TableHead>
              {canManage && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {offers.map((o) => (
              <TableRow key={o.id} data-testid="offer-row">
                <TableCell>
                  <div className="font-medium">{o.title}</div>
                  {o.description && (
                    <div className="max-w-xs truncate text-xs text-muted-foreground">
                      {o.description}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[o.status]}`}
                  >
                    {STATUS_LABEL[o.status]}
                  </span>
                </TableCell>
                <TableCell>{formatOfferValue(o)}</TableCell>
                <TableCell className="whitespace-nowrap text-sm">
                  {formatDay(o.validFrom)} - {formatDay(o.validTo)}
                </TableCell>
                <TableCell className="max-w-xs text-sm">
                  {summarizeEligibility(o.eligibility as OfferEligibilityRules)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm" data-testid="offer-performance">
                  {o.appliedCount === 0
                    ? 'Not applied yet'
                    : `Applied ${o.appliedCount} ${o.appliedCount === 1 ? 'time' : 'times'} · ${formatEUR(o.wonRevenue)} won revenue`}
                </TableCell>
                {canManage && (
                  <TableCell className="whitespace-nowrap text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busyId === o.id}
                      onClick={() => {
                        setEditing(o);
                        setFormOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busyId === o.id}
                      onClick={() =>
                        run(
                          o.id,
                          () => patchOfferRequest(o.id, { isActive: !o.isActive }),
                          o.isActive ? 'Offer deactivated' : 'Offer activated',
                        )
                      }
                    >
                      {o.isActive ? 'Deactivate' : 'Activate'}
                    </Button>
                    {o.appliedCount === 0 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busyId === o.id}
                        onClick={() => {
                          if (window.confirm(`Delete "${o.title}"? This cannot be undone.`))
                            void run(o.id, () => deleteOfferRequest(o.id), 'Offer deleted');
                        }}
                      >
                        Delete
                      </Button>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {canManage && <OfferForm open={formOpen} onOpenChange={setFormOpen} offer={editing} />}
    </div>
  );
}
