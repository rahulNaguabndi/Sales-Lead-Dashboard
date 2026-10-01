'use client';

import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, Repeat } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-client';
import type { LeadSlotProps } from '@/components/leads/detail/types';
import { EditPreferencesDialog } from './EditPreferencesDialog';

/** Slot `customerExtras`: extra customer facts and preference editing under F05's card. */
export function CustomerExtras({ lead, customer }: LeadSlotProps) {
  // TanStack Query dedupes this fetch (it used to run twice per page load from an effect).
  const consent = useQuery({
    queryKey: ['customer', customer.id, 'consent', lead.id],
    queryFn: async () => {
      const res = await apiFetch(`/api/customers/${customer.id}?leadId=${lead.id}`);
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { customer: { marketingConsent: boolean } };
      return body.customer.marketingConsent;
    },
    staleTime: 60_000,
  });

  const copy = (value: string, done: string) => {
    void navigator.clipboard
      ?.writeText(value)
      .then(() => toast.success(done))
      .catch(() => toast.error('Could not copy to the clipboard'));
  };

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <div className="flex flex-wrap gap-1.5">
        {customer.isReturning && (
          <Badge variant="secondary" className="gap-1">
            <Repeat aria-hidden className="h-3 w-3" />
            Returning customer
          </Badge>
        )}
        {consent.isSuccess && !consent.data && (
          <Badge variant="outline">No marketing consent</Badge>
        )}
        {consent.isError && (
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
            aria-label={`Copy phone number ${customer.phone}`}
            onClick={() => copy(customer.phone!, 'Phone number copied')}
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
            aria-label={`Copy email ${customer.email}`}
            onClick={() => copy(customer.email!, 'Email copied')}
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
