import {
  OPEN_STAGES,
  SOURCE_GROUP_OF,
  slaStatus,
  stripDiacritics,
  type LeadListQuery,
  type LeadSource,
  type Role,
  type SlaInput,
  type Stage,
} from '@leaddesk/shared';

// Pure logic for the lead inbox (F04): ranking, SLA, time-zone boundaries, param and search
// normalization. No database, Next.js or React imports, so it is unit-testable in isolation.

export const DEFAULT_TZ = 'Europe/Berlin';

export type ListView = 'mine' | 'unassigned' | 'due_today' | 'going_cold' | 'team';

export type RankFields = {
  overdue: boolean;
  slaBreach: boolean;
  score: number;
  createdAt: number;
};

/** FR-003 comparator: overdue, SLA breach, score DESC, created DESC, id DESC. */
export function compareRank<T extends RankFields & { id: string }>(a: T, b: T): number {
  if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
  if (a.slaBreach !== b.slaBreach) return a.slaBreach ? -1 : 1;
  if (a.score !== b.score) return b.score - a.score;
  if (a.createdAt !== b.createdAt) return b.createdAt - a.createdAt;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/** FR-004 SLA breach, sharing the rule used by the score/SLA badge. */
export function isSlaBreach(lead: SlaInput, now: number): boolean {
  return slaStatus(lead, now).status === 'BREACHED';
}

export function validTz(tz: string | undefined): string {
  if (!tz) return DEFAULT_TZ;
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TZ;
  }
}

type Wall = { y: number; m: number; d: number };

function wallParts(ms: number, tz: string): Wall & { ms: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(ms));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const wallMs = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return { y: get('year'), m: get('month') - 1, d: get('day'), ms: wallMs };
}

function tzOffset(ms: number, tz: string): number {
  return wallParts(ms, tz).ms - Math.floor(ms / 1000) * 1000;
}

/** Local midnight (as epoch ms) of a wall-clock date in tz. Month is 0-based; d may overflow. */
function midnightOf({ y, m, d }: Wall, tz: string): number {
  const wall = Date.UTC(y, m, d);
  const first = wall - tzOffset(wall, tz);
  return wall - tzOffset(first, tz);
}

/** Start of the next local day in tz: the exclusive upper bound of "today". */
export function endOfDay(now: number, tz: string): number {
  const zone = validTz(tz);
  const { y, m, d } = wallParts(now, zone);
  return midnightOf({ y, m, d: d + 1 }, zone);
}

/** Local midnight at the start of an ISO calendar date (YYYY-MM-DD) in tz. */
export function zonedDayStart(isoDate: string, tz: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  return midnightOf({ y: y!, m: m! - 1, d: d! }, validTz(tz));
}

export function defaultView(role: Role): ListView {
  return role === 'REP' ? 'mine' : 'team';
}

export type NormalizedParams = {
  view: ListView;
  stages: readonly Stage[];
  sources: readonly LeadSource[] | null;
  priorities: readonly string[] | null;
  /** User ids or the literal 'unassigned'. Null means no owner filter. */
  owners: string[] | null;
  teams: string[] | null;
  returning: boolean | undefined;
  overdue: boolean;
  slaBreached: boolean;
  createdFrom: string | undefined;
  createdTo: string | undefined;
  q: string | undefined;
  sort: LeadListQuery['sort'];
  page: number;
  pageSize: number;
  tz: string;
};

const OPEN: readonly Stage[] = OPEN_STAGES;

/** Applies role defaults and role-based restrictions. Never throws and never rejects (FR-014). */
export function normalizeListParams(query: LeadListQuery, role: Role): NormalizedParams {
  let view: ListView;
  switch (query.view) {
    case undefined:
      view = defaultView(role);
      break;
    case 'all':
    case 'team':
      view = role === 'REP' ? 'mine' : 'team';
      break;
    default:
      view = query.view;
  }

  let sources: readonly LeadSource[] | null = query.source?.length ? query.source : null;
  if (query.sourceGroup) {
    const members = (Object.keys(SOURCE_GROUP_OF) as LeadSource[]).filter(
      (s) => SOURCE_GROUP_OF[s] === query.sourceGroup,
    );
    sources = sources ? sources.filter((s) => members.includes(s)) : members;
  }

  const stages: readonly Stage[] = query.stage?.length
    ? query.stage
    : query.closed
      ? [...OPEN, 'WON', 'LOST']
      : OPEN;

  return {
    view,
    stages,
    sources,
    priorities: query.priority?.length ? query.priority : null,
    owners: role !== 'REP' && query.owner?.length ? query.owner : null,
    teams: role === 'VP' && query.team?.length ? query.team : null,
    returning: query.returning,
    overdue: query.overdue === true,
    slaBreached: query.sla === 'breached',
    createdFrom: query.createdFrom,
    createdTo: query.createdTo,
    q: query.q,
    sort: query.sort,
    page: query.page,
    pageSize: query.pageSize,
    tz: validTz(query.tz),
  };
}

export type SearchTerms = {
  /** Escaped, normalized fragment for `customers.search_text LIKE '%' || text || '%'`; null if unusable. */
  text: string | null;
  /** Escaped raw prefix for `leads.reference LIKE reference || '%'`. */
  reference: string;
};

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** FR-007: accent/case-insensitive fragment, min 2 chars, phone input reduced to 4+ digits. */
export function searchTerms(q: string | undefined): SearchTerms | null {
  const raw = (q ?? '').trim();
  if (raw.length < 2) return null;
  const normalized = stripDiacritics(raw.toLowerCase());
  let text: string | null;
  if (/^[+\d\s().-]+$/.test(normalized)) {
    const digits = normalized.replace(/\D/g, '');
    text = digits.length >= 4 ? digits : null;
  } else {
    text = escapeLike(normalized);
  }
  return { text, reference: escapeLike(raw) };
}
