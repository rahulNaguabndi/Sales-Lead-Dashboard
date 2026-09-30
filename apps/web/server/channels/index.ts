export type { ChannelAdapter, ChannelCustomer, ChannelLinkOptions } from './ChannelAdapter';
export { DeepLinkAdapter, ADAPTERS } from './DeepLinkAdapter';
export {
  getProfile,
  updatePreferences,
  getContactLink,
  type CustomerProfile,
  type CustomerView,
  type HistoryLead,
  type ContactLink,
  type ProfileDeps,
} from './customer-profile';
export {
  buildMailtoLink,
  buildSmsLink,
  buildTelLink,
  buildWhatsAppLink,
  channelAvailability,
  truncateMessage,
} from '@leaddesk/shared';
