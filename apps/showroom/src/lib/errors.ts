import type { Channel } from '@leaddesk/shared';
import type { IntakeError } from './intake-client';
import { fieldForPath } from './payload';

export const FORM_FIELDS = [
  'firstName',
  'lastName',
  'email',
  'phoneDigits',
  'country',
  'city',
  'language',
  'preferredChannel',
  'bestTime',
  'vehicleModel',
  'budget',
  'message',
] as const;

/** Banner copy for errors that are not shown next to a field; null for pure field errors. */
export function bannerFor(error: IntakeError): string | null {
  switch (error.kind) {
    case 'validation':
      return null;
    case 'rate_limited':
      return 'Too many enquiries from this device. Please try again in a minute.';
    case 'unauthorized':
      return 'The enquiry service is misconfigured. Please contact the dealership.';
    case 'too_large':
      return 'Your enquiry is too large. Please shorten your message.';
    case 'timeout':
      return 'The request timed out. Please try again.';
    case 'network':
    case 'server':
      return "We couldn't send your enquiry. Please try again.";
  }
}

export function isRetryable(error: IntakeError): boolean {
  return ['network', 'server', 'timeout', 'rate_limited'].includes(error.kind);
}

/** Split server validation issues into field errors and an unmapped banner message. */
export function mapValidation(
  error: Extract<IntakeError, { kind: 'validation' }>,
  channel?: Channel,
): { fields: Record<string, string>; banner: string | null } {
  const fields: Record<string, string> = {};
  const unmapped: string[] = [];
  for (const f of error.fields) {
    const name = fieldForPath(f.path, channel);
    if ((FORM_FIELDS as readonly string[]).includes(name)) fields[name] ??= f.message;
    else unmapped.push(f.message);
  }
  const banner =
    unmapped.length > 0 || Object.keys(fields).length === 0
      ? "We couldn't send your enquiry. Please check your details and try again."
      : null;
  return { fields, banner };
}
