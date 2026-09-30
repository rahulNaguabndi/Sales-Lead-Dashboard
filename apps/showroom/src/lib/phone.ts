import { COUNTRIES, type CountryCode } from '@leaddesk/shared';

export function dialForCountry(country: CountryCode): string {
  return COUNTRIES[country].dial;
}

/** Combine a dial code and national digits into one compact number; undefined when no digits. */
export function combinePhone(dial: string, raw: string): string | undefined {
  const dialDigits = dial.replace(/\D/g, '');
  const trimmed = raw.trim();
  let digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+') || trimmed.startsWith('00')) {
    if (trimmed.startsWith('00')) digits = digits.slice(2);
    if (digits.startsWith(dialDigits)) digits = digits.slice(dialDigits.length);
  }
  return digits ? `+${dialDigits}${digits}` : undefined;
}
