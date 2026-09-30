'use client';
import { useQuery } from '@tanstack/react-query';
import type { DemographicsRange, DemographicsResponse } from '@leaddesk/shared';
import { apiFetch } from '@/lib/api-client';

export type DemographicsFilters = {
  range: DemographicsRange;
  sourceGroup: string;
  country: string;
  teamId: string;
};

export function toDemographicsQuery(f: DemographicsFilters): string {
  const p = new URLSearchParams({ range: f.range });
  if (f.sourceGroup) p.set('sourceGroup', f.sourceGroup);
  if (f.country) p.set('country', f.country);
  if (f.teamId) p.set('teamId', f.teamId);
  return p.toString();
}

export class ForbiddenDemographicsError extends Error {}

/** Filter-keyed query: refetches whenever any filter changes and on window focus. */
export function useDemographics(filters: DemographicsFilters) {
  return useQuery<DemographicsResponse>({
    queryKey: ['demographics', filters],
    queryFn: async () => {
      const res = await apiFetch(`/api/dashboard/demographics?${toDemographicsQuery(filters)}`);
      if (res.status === 403) throw new ForbiddenDemographicsError('You do not have access to demographics.');
      if (!res.ok) throw new Error('Failed to load demographics');
      return res.json();
    },
  });
}
