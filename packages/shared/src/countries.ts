import type { Language, TeamRegion } from './enums';

export const COUNTRIES = {
  DE: { name: 'Germany', dial: '+49', region: 'DACH', lang: 'de' },
  AT: { name: 'Austria', dial: '+43', region: 'DACH', lang: 'de' },
  CH: { name: 'Switzerland', dial: '+41', region: 'DACH', lang: 'de' },
  FR: { name: 'France', dial: '+33', region: 'WEST', lang: 'fr' },
  BE: { name: 'Belgium', dial: '+32', region: 'WEST', lang: 'nl' },
  NL: { name: 'Netherlands', dial: '+31', region: 'WEST', lang: 'nl' },
  LU: { name: 'Luxembourg', dial: '+352', region: 'WEST', lang: 'fr' },
  IT: { name: 'Italy', dial: '+39', region: 'SOUTH', lang: 'it' },
  ES: { name: 'Spain', dial: '+34', region: 'SOUTH', lang: 'es' },
  PT: { name: 'Portugal', dial: '+351', region: 'SOUTH', lang: 'pt' },
  PL: { name: 'Poland', dial: '+48', region: null, lang: 'pl' },
  IE: { name: 'Ireland', dial: '+353', region: null, lang: 'en' },
  DK: { name: 'Denmark', dial: '+45', region: null, lang: 'da' },
} as const satisfies Record<
  string,
  { name: string; dial: string; region: TeamRegion | null; lang: Language }
>;

export type CountryCode = keyof typeof COUNTRIES;

export const COUNTRY_CODES = Object.keys(COUNTRIES) as [CountryCode, ...CountryCode[]];
