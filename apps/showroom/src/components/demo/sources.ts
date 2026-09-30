import type { SourceSelection } from '../../lib/payload';

export const SOURCE_OPTIONS = [
  { id: 'website', label: 'Website (direct)', selection: { source: 'WEBSITE' } },
  {
    id: 'instagram',
    label: 'Instagram · autumn-suv',
    selection: { source: 'INSTAGRAM', sourceDetail: 'autumn-suv' },
  },
  { id: 'facebook', label: 'Facebook', selection: { source: 'FACEBOOK' } },
  { id: 'google', label: 'Google Ads', selection: { source: 'GOOGLE_ADS' } },
  { id: 'portal', label: 'Portal', selection: { source: 'PORTAL' } },
  { id: 'referral', label: 'Referral', selection: { source: 'REFERRAL' } },
] as const satisfies readonly { id: string; label: string; selection: SourceSelection }[];

export type SourceId = (typeof SOURCE_OPTIONS)[number]['id'];

export const SOURCE_STORAGE_KEY = 'showroom.demo.source';

export function selectionFor(id: string): SourceSelection {
  const found = SOURCE_OPTIONS.find((o) => o.id === id) ?? SOURCE_OPTIONS[0];
  return { ...found.selection } as SourceSelection;
}

export function loadSourceId(): SourceId {
  try {
    const v = localStorage.getItem(SOURCE_STORAGE_KEY);
    if (SOURCE_OPTIONS.some((o) => o.id === v)) return v as SourceId;
  } catch {
    /* storage unavailable */
  }
  return 'website';
}

export function saveSourceId(id: SourceId): void {
  try {
    localStorage.setItem(SOURCE_STORAGE_KEY, id);
  } catch {
    /* storage unavailable */
  }
}
