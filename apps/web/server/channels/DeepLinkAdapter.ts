import {
  buildMailtoLink,
  buildSmsLink,
  buildTelLink,
  buildWhatsAppLink,
  channelAvailability,
  type Channel,
} from '@leaddesk/shared';
import type { ChannelAdapter, ChannelCustomer, ChannelLinkOptions } from './ChannelAdapter';

export class DeepLinkAdapter implements ChannelAdapter {
  constructor(readonly channel: Channel) {}

  isAvailable(customer: ChannelCustomer) {
    return channelAvailability(customer, this.channel);
  }

  buildLink(customer: ChannelCustomer, message: string, opts: ChannelLinkOptions = {}): string {
    const check = this.isAvailable(customer);
    if (!check.available) throw new Error(check.reason);
    switch (this.channel) {
      case 'WHATSAPP':
        return buildWhatsAppLink(customer.phone!, message);
      case 'SMS':
        return buildSmsLink(customer.phone!, message);
      case 'EMAIL':
        return buildMailtoLink(customer.email!, opts.subject ?? '', message);
      case 'CALL':
        return buildTelLink(customer.phone!);
    }
  }
}

export const ADAPTERS: Record<Channel, ChannelAdapter> = {
  CALL: new DeepLinkAdapter('CALL'),
  WHATSAPP: new DeepLinkAdapter('WHATSAPP'),
  SMS: new DeepLinkAdapter('SMS'),
  EMAIL: new DeepLinkAdapter('EMAIL'),
};
