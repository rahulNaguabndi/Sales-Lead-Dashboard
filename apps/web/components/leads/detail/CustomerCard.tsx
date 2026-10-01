import type { ReactNode } from 'react';
import { Star } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatPhone } from './format';
import type { LeadDetail } from './types';

import { channelLabel, humanize, languageLabel } from '@leaddesk/shared';
const dash = (v: string | null | undefined) => (v ? v : '—');

function Row({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <dt className="text-muted-foreground">{name}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

export function CustomerCard({
  customer,
  extras,
}: {
  customer: LeadDetail['customer'];
  extras?: ReactNode;
}) {
  const place = [customer.city, customer.country].filter(Boolean).join(', ');
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Customer</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="space-y-1.5">
          <Row name="Phone">{formatPhone(customer.phone)}</Row>
          <Row name="Email">{dash(customer.email)}</Row>
          <Row name="Location">{dash(place)}</Row>
          <Row name="Age band">{customer.ageBand === 'UNKNOWN' ? '—' : customer.ageBand}</Row>
          <Row name="Language">{languageLabel(customer.language)}</Row>
          <Row name="Preferred channel">
            <span className="inline-flex items-center gap-1">
              <Star aria-hidden className="h-3 w-3 fill-amber-400 text-amber-400" />
              {channelLabel(customer.preferredChannel)}
            </span>
          </Row>
          <Row name="Secondary">
            {customer.secondaryChannel ? channelLabel(customer.secondaryChannel) : '—'}
          </Row>
          <Row name="Best time">{humanize(customer.bestTime)}</Row>
        </dl>
        {extras}
      </CardContent>
    </Card>
  );
}
