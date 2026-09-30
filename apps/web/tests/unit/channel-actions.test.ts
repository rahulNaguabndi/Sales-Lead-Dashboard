import { describe, expect, it } from 'vitest';
import {
  composerPrefillFor,
  defaultTemplateKey,
  orderChannels,
} from '../../components/leads/channels/channel-actions';

describe('channel actions', () => {
  it('orders preferred, secondary, then the rest', () => {
    expect(orderChannels('WHATSAPP', 'SMS')).toEqual(['WHATSAPP', 'SMS', 'CALL', 'EMAIL']);
    expect(orderChannels('CALL', null)).toEqual(['CALL', 'WHATSAPP', 'SMS', 'EMAIL']);
  });
  it('picks first_contact until there is activity', () => {
    expect(defaultTemplateKey(null)).toBe('first_contact');
    expect(defaultTemplateKey(1234)).toBe('follow_up');
  });
  it('prefills the composer per channel', () => {
    expect(composerPrefillFor('CALL', '')).toEqual({
      type: 'CALL',
      note: 'Called customer',
      aiAssisted: false,
    });
    expect(composerPrefillFor('WHATSAPP', 'Ciao')).toEqual({
      type: 'WHATSAPP',
      note: 'Ciao',
      aiAssisted: false,
    });
  });
});
