import { apiFetch } from '@/lib/api-client';
import type { FollowUpList, LeadFollowUps } from '@/server/services/followup';

export type { FollowUpList, LeadFollowUps };

export async function fetchLeadFollowUps(leadId: string): Promise<LeadFollowUps> {
  const res = await apiFetch(`/api/leads/${leadId}/follow-ups`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchFollowUps(view: 'today' | 'overdue' | 'upcoming'): Promise<FollowUpList> {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const sp = new URLSearchParams({ view });
  if (tz) sp.set('tz', tz);
  const res = await apiFetch(`/api/follow-ups?${sp.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function send(url: string, method: string, body: unknown): Promise<void> {
  const res = await apiFetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error?.fields?.dueAt ?? data?.error?.message ?? `HTTP ${res.status}`);
  }
}

export const scheduleFollowUp = (leadId: string, dueAt: number, note?: string) =>
  send(`/api/leads/${leadId}/follow-ups`, 'POST', { dueAt, ...(note ? { note } : {}) });

export const patchFollowUp = (
  id: string,
  body: { action: 'complete' } | { action: 'snooze'; dueAt: number } | { action: 'cancel'; note?: string },
) => send(`/api/follow-ups/${id}`, 'PATCH', body);
