'use client';

import { useEffect, useState } from 'react';
import { Copy, Repeat } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-client';
import type { LeadSlotProps } from '@/components/leads/detail/types';
import { EditPreferencesDialog } from './EditPreferencesDialog';

type State =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; marketingConsent: boolean };

/** Slot `customerExtras`: extra customer facts and preference editing under F05's card. */
export function CustomerExtras({ lead, customer }: LeadSlotProps) {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    apiFetch(`/api/customers/${customer.id}?leadId=${lead.id}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { customer: { marketingConsent: boolean } };
        if (!cancelled) {
          setState({ status: 'ready', marketingConsent: body.customer.marketingConsent });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [customer.id, lead.id, customer.preferredChannel, customer.secondaryChannel]);

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <div className="flex flex-wrap gap-1.5">
        {customer.isReturning && (
          <Badge variant="secondary" className="gap-1">
            <Repeat aria-hidden className="h-3 w-3" />
            Returning customer
          </Badge>
        )}
        {state.status === 'ready' && !state.marketingConsent && (
          <Badge variant="outline">No marketing consent</Badge>
        )}
        {state.status === 'error' && (
          <span className="text-xs text-muted-foreground" role="status">
            Consent status unavailable
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {customer.phone && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void navigator.clipboard?.writeText(customer.phone!)}
          >
            <Copy aria-hidden />
            Copy phone
          </Button>
        )}
        {customer.email && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void navigator.clipboard?.writeText(customer.email!)}
          >
            <Copy aria-hidden />
            Copy email
          </Button>
        )}
        {lead.id && <EditPreferencesDialog leadId={lead.id} customer={customer} />}
      </div>
    </div>
  );
}
