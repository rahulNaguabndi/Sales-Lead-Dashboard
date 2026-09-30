import { describe, expect, it } from 'vitest';
import {
  MESSAGE_MAX_LENGTH,
  buildMailtoLink,
  buildSmsLink,
  buildTelLink,
  buildWhatsAppLink,
  channelAvailability,
  truncateMessage,
} from './channels';

describe('link builders', () => {
  it('builds wa.me with digits only and encoded text', () => {
    expect(buildWhatsAppLink('+39 347 123 4567', 'Ciao Giulia')).toBe(
      'https://wa.me/393471234567?text=Ciao%20Giulia',
    );
  });
  it('builds tel and sms links', () => {
    expect(buildTelLink('+393471234567')).toBe('tel:+393471234567');
    expect(buildSmsLink('+393471234567', 'Hi there')).toBe('sms:+393471234567?&body=Hi%20there');
  });
  it('builds mailto with subject and body', () => {
    expect(buildMailtoLink('a@b.it', 'Hello', 'Body text')).toBe(
      'mailto:a@b.it?subject=Hello&body=Body%20text',
    );
  });
  it('encodes accents, special chars, newlines and emoji', () => {
    const text = 'Émile & João? #1\nok 🚗';
    const href = buildWhatsAppLink('+33612345678', text);
    expect(href).toBe(`https://wa.me/33612345678?text=${encodeURIComponent(text)}`);
    expect(decodeURIComponent(href.split('text=')[1]!)).toBe(text);
  });
});

describe('truncateMessage', () => {
  it('leaves short text alone', () => {
    expect(truncateMessage('hi')).toEqual({ text: 'hi', truncated: false });
  });
  it('truncates to 1000 chars with a flag', () => {
    const r = truncateMessage('x'.repeat(1500));
    expect(r.text).toHaveLength(MESSAGE_MAX_LENGTH);
    expect(r.truncated).toBe(true);
  });
});

describe('channelAvailability', () => {
  it('CALL/SMS/WHATSAPP need a valid phone', () => {
    for (const ch of ['CALL', 'SMS', 'WHATSAPP'] as const) {
      expect(channelAvailability({ phone: '+393471234567', email: null }, ch).available).toBe(true);
      expect(channelAvailability({ phone: null, email: 'a@b.it' }, ch)).toEqual({
        available: false,
        reason: 'No phone number on file',
      });
      expect(channelAvailability({ phone: '12', email: null }, ch)).toEqual({
        available: false,
        reason: 'Invalid phone number',
      });
    }
  });
  it('EMAIL needs an email', () => {
    expect(channelAvailability({ phone: '+393471234567', email: null }, 'EMAIL')).toEqual({
      available: false,
      reason: 'No email on file',
    });
    expect(channelAvailability({ phone: null, email: 'a@b.it' }, 'EMAIL').available).toBe(true);
  });
});
