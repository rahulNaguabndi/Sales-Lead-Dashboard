import type { LeadListResult } from '@/server/services/lead-query';
import { apiFetch } from '@/lib/api-client';
import { toQueryString, type InboxParams } from './inbox-params';

/** GET /api/leads with the browser's time zone (day boundaries for "due today"). */
export async function fetchLeads(params: InboxParams): Promise<LeadListResult> {
  const sp = new URLSearchParams(toQueryString(params));
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (tz) sp.set('tz', tz);
  const res = await apiFetch(`/api/leads?${sp.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
