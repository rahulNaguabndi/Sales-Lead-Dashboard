import type { Channel, UserActivityType } from '@leaddesk/shared';
import type { ComposerPrefill } from '@/components/leads/composer';

export const CHANNEL_LABEL: Record<Channel, string> = {
  CALL: 'Call',
  WHATSAPP: 'WhatsApp',
  SMS: 'SMS',
  EMAIL: 'Email',
};

/** Preferred first, then secondary, then the rest in a stable order. */
export function orderChannels(preferred: Channel, secondary: Channel | null): Channel[] {
  const rest = (['CALL', 'WHATSAPP', 'SMS', 'EMAIL'] as const).filter(
    (c) => c !== preferred && c !== secondary,
  );
  return [preferred, ...(secondary ? [secondary] : []), ...rest];
}

/** First touch uses `first_contact`; once the lead has activity, `follow_up`. */
export function defaultTemplateKey(lastActivityAt: number | null): 'first_contact' | 'follow_up' {
  return lastActivityAt == null ? 'first_contact' : 'follow_up';
}

/** What clicking a channel pre-fills in the activity composer (nothing is saved until submit). */
export function composerPrefillFor(channel: Channel, message: string): ComposerPrefill {
  const type: UserActivityType = channel;
  return { type, note: channel === 'CALL' ? 'Called customer' : message, aiAssisted: false };
}
