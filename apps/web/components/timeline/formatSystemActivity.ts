import { formatEUR } from '@leaddesk/shared';

type Meta = Record<string, unknown> | null | undefined;

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const label = (v: string) => v.replace(/_/g, ' ').toLowerCase();

const FORMATTERS: Record<string, (m: Record<string, unknown>) => string> = {
  LEAD_CREATED: (m) => (str(m.source) ? `Lead created from ${label(str(m.source)!)}` : 'Lead created'),
  STAGE_CHANGED: (m) =>
    m.reopened === true
      ? 'Reopened'
      : m.to === 'WON' && typeof m.dealValue === 'number'
        ? `Won · ${formatEUR(m.dealValue)}${str(m.vehicleModel) ? ` · ${label(str(m.vehicleModel)!)}` : ''}`
        : m.to === 'LOST' && str(m.lostReason)
          ? `Lost · ${label(str(m.lostReason)!)}`
          : str(m.from) && str(m.to)
            ? `Stage changed from ${label(str(m.from)!)} to ${label(str(m.to)!)}`
            : str(m.to)
              ? `Stage changed to ${label(str(m.to)!)}`
              : 'Stage changed',
  ASSIGNED: (m) => (str(m.toName) ? `Assigned to ${str(m.toName)}` : 'Lead assigned'),
  CLAIMED: (m) => (str(m.byName) ? `Claimed by ${str(m.byName)}` : 'Lead claimed'),
  FOLLOW_UP_SCHEDULED: (m) =>
    str(m.dueAt) ? `Follow-up scheduled for ${str(m.dueAt)}` : 'Follow-up scheduled',
  FOLLOW_UP_MISSED: () => 'Follow-up missed',
  AUTO_COLD: () => 'Marked cold automatically after no response',
  OFFER_APPLIED: (m) => (str(m.title) ? `Offer applied: ${str(m.title)}` : 'Offer applied'),
  SCORE_CHANGED: (m) =>
    typeof m.from === 'number' && typeof m.to === 'number'
      ? `Score changed from ${m.from} to ${m.to}`
      : typeof m.to === 'number'
        ? `Score changed to ${m.to}`
        : 'Score changed',
};

/** Single formatter map for SYSTEM entries. Unknown types fall back to the raw type name. */
export function formatSystemActivity(type: string, metadata: Meta): string {
  const fn = FORMATTERS[type];
  if (!fn) return type;
  return fn(metadata ?? {});
}

export { formatEUR };
