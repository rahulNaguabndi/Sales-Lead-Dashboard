import { AlertTriangle } from 'lucide-react';

/** Amber "At risk · 4 d idle" badge: text + icon, never colour alone. */
export function AtRiskBadge({ idleDays }: { idleDays: number }) {
  return (
    <span
      data-testid="at-risk-badge"
      className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-300"
    >
      <AlertTriangle className="h-3 w-3" aria-hidden />
      At risk · {idleDays} d idle
    </span>
  );
}

export const COLD_CHIP_TOOLTIP = 'Auto-moved: no activity for 7 days';

/** Banner shown on the detail page when a live update moved the lead to Cold. */
export function ColdBanner() {
  return (
    <div
      role="status"
      data-testid="cold-banner"
      className="rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sm text-sky-200"
    >
      Lead moved to Cold
    </div>
  );
}
