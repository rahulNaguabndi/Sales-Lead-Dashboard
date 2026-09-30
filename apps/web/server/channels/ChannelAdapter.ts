import type { Channel } from '@leaddesk/shared';

export type ChannelCustomer = { phone: string | null; email: string | null };

export type ChannelLinkOptions = { subject?: string };

/** Extension point: real messaging vendors can implement `send` later; deep links need no vendor. */
export interface ChannelAdapter {
  readonly channel: Channel;
  isAvailable(
    customer: ChannelCustomer,
  ): { available: true } | { available: false; reason: string };
  buildLink(customer: ChannelCustomer, message: string, opts?: ChannelLinkOptions): string;
  send?(customer: ChannelCustomer, message: string): Promise<void>;
}
