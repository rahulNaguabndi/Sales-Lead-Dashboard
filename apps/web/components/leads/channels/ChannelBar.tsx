'use client';

import { useMemo } from 'react';
import { Mail, MessageCircle, MessageSquare, Phone, Star } from 'lucide-react';
import { buildTelLink, channelAvailability, type Channel } from '@leaddesk/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useOptionalComposer } from '@/components/leads/composer/useComposer';
import type { LeadSlotProps } from '@/components/leads/detail/types';
import { BestTimeHint } from './BestTimeHint';
import { TemplatePicker } from './TemplatePicker';
import {
  CHANNEL_LABEL,
  composerPrefillFor,
  defaultTemplateKey,
  orderChannels,
} from './channel-actions';

const ICON = { CALL: Phone, WHATSAPP: MessageCircle, SMS: MessageSquare, EMAIL: Mail } as const;

export function ChannelBar({ lead, customer, currentUser }: LeadSlotProps) {
  const composer = useOptionalComposer();
  const vars = useMemo(
    () => ({
      firstName: customer.firstName,
      repFirstName: currentUser.name.split(' ')[0],
      dealership: 'EuroDrive Motors',
      model: lead.vehicleName ?? '',
      // F15 (offers) is not built yet: no applicable offer, so `offer_share` is disabled.
      offer: undefined,
    }),
    [customer.firstName, currentUser.name, lead.vehicleName],
  );
  const defaultKey = defaultTemplateKey(lead.lastActivityAt);

  const prefill = (channel: Channel, message: string) => {
    // Logging is a deliberate second step: only prefill, never save on click (FR-007).
    composer?.prefill(composerPrefillFor(channel, message));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Contact</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Contact channels">
          {orderChannels(customer.preferredChannel, customer.secondaryChannel).map((channel) => {
            const avail = channelAvailability(customer, channel);
            const primary = channel === customer.preferredChannel;
            const Icon = ICON[channel];
            const variant = primary ? 'default' : 'outline';
            const label = (
              <>
                <Icon aria-hidden />
                {primary && <Star aria-hidden className="fill-current" />}
                {CHANNEL_LABEL[channel]}
              </>
            );
            if (!avail.available) {
              return (
                <Button
                  key={channel}
                  type="button"
                  variant={variant}
                  size="sm"
                  disabled
                  title={avail.reason}
                  aria-label={`${CHANNEL_LABEL[channel]} unavailable: ${avail.reason}`}
                >
                  {label}
                </Button>
              );
            }
            if (channel === 'CALL') {
              return (
                // Copy phone/email live once, in the Customer card.
                <Button key={channel} asChild variant={variant} size="sm">
                  <a
                    href={buildTelLink(customer.phone!)}
                    onClick={() => prefill('CALL', '')}
                    data-channel="CALL"
                  >
                    {label}
                  </a>
                </Button>
              );
            }
            return (
              <TemplatePicker
                key={channel}
                channel={channel}
                customer={customer}
                vars={vars}
                defaultKey={defaultKey}
                onOpen={(message) => prefill(channel, message)}
                trigger={
                  <Button type="button" variant={variant} size="sm" data-channel={channel}>
                    {label}
                  </Button>
                }
              />
            );
          })}
        </div>
        <BestTimeHint customer={customer} />
      </CardContent>
    </Card>
  );
}
