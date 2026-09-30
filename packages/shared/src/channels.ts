import type { Channel } from './enums';

export const MESSAGE_MAX_LENGTH = 1000;

const E164 = /^\+[1-9]\d{6,14}$/;

function compactPhone(phone: string): string {
  return phone.replace(/[\s().-]/g, '');
}

function digits(phone: string): string {
  return compactPhone(phone).replace(/^\+/, '');
}

export function buildWhatsAppLink(phone: string, text: string): string {
  return `https://wa.me/${digits(phone)}?text=${encodeURIComponent(text)}`;
}

export function buildTelLink(phone: string): string {
  return `tel:+${digits(phone)}`;
}

/** `?&body=` works on both iOS and Android. */
export function buildSmsLink(phone: string, body: string): string {
  return `sms:+${digits(phone)}?&body=${encodeURIComponent(body)}`;
}

export function buildMailtoLink(email: string, subject: string, body: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function truncateMessage(
  text: string,
  max: number = MESSAGE_MAX_LENGTH,
): { text: string; truncated: boolean } {
  return text.length > max
    ? { text: text.slice(0, max), truncated: true }
    : { text, truncated: false };
}

export type ChannelAvailability = { available: true } | { available: false; reason: string };

export function channelAvailability(
  customer: { phone: string | null; email: string | null },
  channel: Channel,
): ChannelAvailability {
  if (channel === 'EMAIL') {
    return customer.email ? { available: true } : { available: false, reason: 'No email on file' };
  }
  if (!customer.phone) return { available: false, reason: 'No phone number on file' };
  if (!E164.test(compactPhone(customer.phone))) {
    return { available: false, reason: 'Invalid phone number' };
  }
  return { available: true };
}
