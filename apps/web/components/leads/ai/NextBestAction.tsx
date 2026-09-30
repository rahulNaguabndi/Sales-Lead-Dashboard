'use client';

import { buildTelLink, type Channel } from '@leaddesk/shared';
import { Button } from '@/components/ui/button';
import { composerPrefillFor, CHANNEL_LABEL } from '@/components/leads/channels/channel-actions';
import { useOptionalComposer } from '@/components/leads/composer/useComposer';
import type { SuggestResponse } from '@/server/services/ai/schemas';

const ACTION_LABEL: Record<SuggestResponse['nextBestAction']['action'], string> = {
  CALL: 'Call',
  WHATSAPP: 'WhatsApp',
  SMS: 'SMS',
  EMAIL: 'Email',
  SCHEDULE_TEST_DRIVE: 'Schedule test drive',
  SEND_OFFER: 'Send offer',
  ESCALATE_TO_MANAGER: 'Escalate to manager',
  WAIT: 'Wait',
};

type Props = {
  action: SuggestResponse['nextBestAction'];
  offerTitle?: string;
  phone: string | null;
  disabled?: boolean;
};

/** Next best action. "Do it" prefills the composer for the channel (nothing is saved or sent). */
export function NextBestAction({ action, offerTitle, phone, disabled }: Props) {
  const composer = useOptionalComposer();
  const channel: Channel | null = action.channel;
  const doIt = () => {
    if (!channel) return;
    composer?.prefill(composerPrefillFor(channel, ''));
    if (channel === 'CALL' && phone) window.location.href = buildTelLink(phone);
  };
  return (
    <div className="space-y-1 rounded-md border p-2.5 text-sm" data-testid="ai-nba">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium">
          {ACTION_LABEL[action.action]}
          <span className="ml-2 font-normal text-muted-foreground">{action.timing}</span>
        </p>
        {channel && (
          <Button type="button" size="sm" disabled={disabled} onClick={doIt}>
            Do it · {CHANNEL_LABEL[channel]}
          </Button>
        )}
      </div>
      <p className="text-muted-foreground">{action.reason}</p>
      {action.offerId && offerTitle && (
        <a href="#offers" className="text-xs underline underline-offset-2">
          Offer: {offerTitle}
        </a>
      )}
    </div>
  );
}
