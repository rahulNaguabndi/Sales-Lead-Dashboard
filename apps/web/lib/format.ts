// Canonical client-side import path for formatting (avoids importing from server/ in client code).
export { formatDate, formatEUR, formatRelative, formatDateTime } from '@leaddesk/shared';

/** The viewer's time zone, for rendering-edge formatting. */
export const localTimeZone = (): string =>
  typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' : 'UTC';
