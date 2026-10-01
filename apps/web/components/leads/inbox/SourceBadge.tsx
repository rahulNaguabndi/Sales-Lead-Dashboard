import { sourceLabel, type LeadSource } from '@leaddesk/shared';

export { sourceLabel };

export function SourceBadge({ source }: { source: LeadSource }) {
  return (
    <span className="inline-flex rounded border border-slate-700 px-1.5 py-0.5 text-xs text-slate-300">
      {sourceLabel(source)}
    </span>
  );
}
