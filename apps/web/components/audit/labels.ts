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

const STAGE_LABELS: Record<string, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Qualified',
  TEST_DRIVE: 'Test drive',
  NEGOTIATION: 'Negotiation',
  WON: 'Won',
  LOST: 'Lost',
};

export const MAX_VALUE_CHARS = 500;
const MONEY_KEYS = new Set(['value', 'amount', 'price', 'budgetMin', 'budgetMax']);
const TIME_KEYS = /(At|_at)$/;

export function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, (_, a: string, b: string) => `${a} ${b.toLowerCase()}`).replace(/^./, (c) => c.toUpperCase());
}

export function formatValue(
  key: string,
  value: unknown,
  resolved: Record<string, Record<string, string>> = {},
): { text: string; truncated: boolean } {
  let text: string;
  if (value === null || value === undefined) text = '—';
  else if (key === 'stage' && typeof value === 'string') text = STAGE_LABELS[value] ?? value;
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

export type DiffRow = { key: string; label: string; before: string; after: string; changed: boolean };

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
    const raw = typeof after === 'string' ? after : typeof before === 'string' ? before : JSON.stringify(after ?? before);
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
