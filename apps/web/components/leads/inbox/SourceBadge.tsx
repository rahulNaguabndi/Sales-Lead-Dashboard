import type { LeadSource } from '@leaddesk/shared';

const LABELS: Record<LeadSource, string> = {
  WEBSITE: 'Website',
  FACEBOOK: 'Facebook',
  INSTAGRAM: 'Instagram',
  GOOGLE_ADS: 'Google Ads',
  PORTAL: 'Portal',
  WALK_IN: 'Walk-in',
  PHONE: 'Phone',
  REFERRAL: 'Referral',
};

export const sourceLabel = (s: LeadSource) => LABELS[s];

export function SourceBadge({ source }: { source: LeadSource }) {
  return (
    <span className="inline-flex rounded border border-slate-700 px-1.5 py-0.5 text-xs text-slate-300">
      {LABELS[source]}
    </span>
  );
}
