import { humanize, lostReasonLabel, stageLabel } from '@leaddesk/shared';
import { formatDateTime, formatEUR } from '@/lib/format';

const FIELD_LABELS: Record<string, string> = {
  ownerId: 'Owner',
  owner_id: 'Owner',
  assignedTo: 'Assigned to',
  teamId: 'Team',
  stage: 'Stage',
  score: 'Score',
  priority: 'Priority',
  lostReason: 'Lost reason',
  autoAssign: 'Auto-assign',
  assignStrategy: 'Assignment strategy',
  value: 'Value',
  dueAt: 'Due',
  status: 'Status',
};

const ACTION_LABELS: Record<string, string> = {
  'lead.intake': 'Lead created',
  'lead.assign': 'Lead assigned',
  'lead.stage': 'Stage changed',
  'lead.auto_cold': 'Went cold',
  'lead.score': 'Score updated',
  'activity.create': 'Activity logged',
  'follow_up.create': 'Follow-up scheduled',
  'follow_up.complete': 'Follow-up done',
  'follow_up.snooze': 'Follow-up snoozed',
  'follow_up.cancel': 'Follow-up cancelled',
  'offer.create': 'Offer created',
  'offer.update': 'Offer updated',
  'offer.delete': 'Offer deleted',
  'team.settings.update': 'Team settings changed',
  'customer.preferences.update': 'Customer preferences changed',
  'auth.login': 'Signed in',
  'auth.logout': 'Signed out',
  'auth.login_failed': 'Failed sign-in',
};

/** Audit action code → readable label ("lead.assign" → "Lead assigned"). */
export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? humanize(action.replace(/\./g, ' ').replace(/_/g, ' '));
}

/** Coarse badge colour per action family. */
export function actionTone(action: string): string {
  if (action.startsWith('auth.')) return 'bg-slate-500/15 text-slate-300';
  if (action.startsWith('lead.')) return 'bg-blue-500/15 text-blue-300';
  if (action.startsWith('offer.')) return 'bg-green-500/15 text-green-300';
  if (action.startsWith('team.')) return 'bg-amber-500/15 text-amber-300';
  return 'bg-muted text-foreground';
}

export const MAX_VALUE_CHARS = 500;
const MONEY_KEYS = new Set(['value', 'amount', 'price', 'budgetMin', 'budgetMax']);
const TIME_KEYS = /(At|_at)$/;

export function fieldLabel(key: string): string {
  return (
    FIELD_LABELS[key] ??
    key
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, (_, a: string, b: string) => `${a} ${b.toLowerCase()}`)
      .replace(/^./, (c) => c.toUpperCase())
  );
}

export function formatValue(
  key: string,
  value: unknown,
  resolved: Record<string, Record<string, string>> = {},
): { text: string; truncated: boolean } {
  let text: string;
  if (value === null || value === undefined) text = '—';
  else if (key === 'stage' && typeof value === 'string') text = stageLabel(value);
  else if (key === 'lostReason' && typeof value === 'string') text = lostReasonLabel(value);
  else if (typeof value === 'string' && resolved[key]?.[value]) text = resolved[key]![value]!;
  else if (MONEY_KEYS.has(key) && typeof value === 'number') text = formatEUR(value);
  else if (TIME_KEYS.test(key) && typeof value === 'number') text = formatDateTime(value);
  else if (typeof value === 'string') text = value;
  else {
    try {
      text = JSON.stringify(value);
    } catch {
      text = String(value);
    }
  }
  return text.length > MAX_VALUE_CHARS
    ? { text: text.slice(0, MAX_VALUE_CHARS) + '…', truncated: true }
    : { text, truncated: false };
}

export type DiffRow = {
  key: string;
  label: string;
  before: string;
  after: string;
  changed: boolean;
};

/** Builds labelled rows; changed keys first. A non-object payload (malformed JSON) falls back to raw. */
export function buildDiff(
  before: unknown,
  after: unknown,
  resolved: Record<string, Record<string, string>> = {},
): { rows: DiffRow[]; raw: string | null } {
  const isObj = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === 'object' && !Array.isArray(v);
  const nullish = (v: unknown) => v === null || v === undefined;
  if ((!nullish(before) && !isObj(before)) || (!nullish(after) && !isObj(after))) {
    const raw =
      typeof after === 'string'
        ? after
        : typeof before === 'string'
          ? before
          : JSON.stringify(after ?? before);
    return { rows: [], raw: formatValue('raw', raw).text };
  }
  const b = isObj(before) ? before : {};
  const a = isObj(after) ? after : {};
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])];
  const rows = keys.map((key) => ({
    key,
    label: fieldLabel(key),
    before: formatValue(key, b[key], resolved).text,
    after: formatValue(key, a[key], resolved).text,
    changed: JSON.stringify(b[key]) !== JSON.stringify(a[key]),
  }));
  rows.sort((x, y) => Number(y.changed) - Number(x.changed));
  return { rows, raw: null };
}
