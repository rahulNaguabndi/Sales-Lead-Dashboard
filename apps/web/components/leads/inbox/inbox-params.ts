import { LeadListQuerySchema } from '@leaddesk/shared';

// Pure helpers for URL <-> inbox state (FR-010). The URL query string is the source of truth.

export const FILTER_KEYS = [
  'stage',
  'source',
  'priority',
  'owner',
  'team',
  'returning',
  'overdue',
  'closed',
  'sla',
  'sourceGroup',
  'createdFrom',
  'createdTo',
  'q',
] as const;

const SCHEMA_KEYS = ['view', ...FILTER_KEYS, 'sort', 'page', 'pageSize'] as const;

export type InboxParams = Record<string, string>;

/**
 * Keeps only known keys whose values the API schema accepts. Bad params are dropped so the page
 * shows defaults instead of an error (spec §5).
 */
export function lenientParams(
  raw: Record<string, string | string[] | undefined> | URLSearchParams,
): InboxParams {
  const entries: [string, string][] =
    raw instanceof URLSearchParams
      ? [...raw.entries()]
      : Object.entries(raw).flatMap(([k, v]) =>
          v === undefined ? [] : [[k, Array.isArray(v) ? (v[0] ?? '') : v] as [string, string]],
        );
  const out: InboxParams = {};
  for (const [key, value] of entries) {
    if (!(SCHEMA_KEYS as readonly string[]).includes(key) || value === '') continue;
    if (key === 'q' && value.trim().length < 2) continue;
    if (LeadListQuerySchema.safeParse({ [key]: value }).success) out[key] = value;
  }
  return out;
}

/** Stable, sorted query string; defaults (page=1) are omitted so equal states share a cache key. */
export function toQueryString(params: InboxParams): string {
  const sp = new URLSearchParams();
  for (const key of Object.keys(params).sort()) {
    const v = params[key];
    if (v === undefined || v === '' || (key === 'page' && v === '1')) continue;
    sp.set(key, v);
  }
  return sp.toString();
}

/** Applies a patch (undefined/'' removes a key). Anything but a page change resets to page 1. */
export function patchParams(
  current: InboxParams,
  patch: Record<string, string | undefined>,
): InboxParams {
  const next: InboxParams = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === '') delete next[k];
    else next[k] = v;
  }
  if (!('page' in patch)) delete next.page;
  return next;
}

/** "Clear filters" keeps the tab (view), sort and page size. */
export function clearFilters(current: InboxParams): InboxParams {
  const next: InboxParams = { ...current };
  for (const k of FILTER_KEYS) delete next[k];
  delete next.page;
  return next;
}

export function activeFilterKeys(params: InboxParams): string[] {
  return FILTER_KEYS.filter((k) => params[k] !== undefined);
}

export const csvValues = (v: string | undefined): string[] =>
  v ? v.split(',').filter(Boolean) : [];

export function toggleCsv(current: string | undefined, value: string): string | undefined {
  const set = new Set(csvValues(current));
  if (set.has(value)) set.delete(value);
  else set.add(value);
  return set.size ? [...set].join(',') : undefined;
}
