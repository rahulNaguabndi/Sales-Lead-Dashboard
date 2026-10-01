'use client';
import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  DEMOGRAPHICS_RANGES,
  SOURCE_GROUPS,
  sourceGroupLabel,
  type DemographicsRange,
} from '@leaddesk/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { ChannelMixChart } from './ChannelMixChart';
import { ConversionByBandChart } from './ConversionByBandChart';
import { CountryFilter } from './CountryFilter';
import { MethodologyPopover } from './MethodologyPopover';
import { ModelInterestHeatmap } from './ModelInterestHeatmap';
import { useDemographics, type DemographicsFilters } from './use-demographics';

const RANGE_LABEL: Record<DemographicsRange, string> = {
  today: 'Today',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  custom: 'Custom',
};

const PICKABLE = DEMOGRAPHICS_RANGES.filter((r) => r !== 'custom');

/**
 * Filters live in the URL with the same names and the same default (Last 30 days) as the
 * Overview tab, so switching tabs keeps the period, team and source (F17 FR-007).
 * Team filter is offered to org-wide viewers only (the API ignores teamId for managers).
 */
function useDemographicsFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const raw = search.toString();
  const filters = useMemo<DemographicsFilters>(() => {
    const sp = new URLSearchParams(raw);
    const range = sp.get('range') as DemographicsRange | null;
    const group = sp.get('sourceGroup') ?? '';
    return {
      range: range && (PICKABLE as readonly string[]).includes(range) ? range : '30d',
      sourceGroup: (SOURCE_GROUPS as readonly string[]).includes(group) ? group : '',
      country: sp.get('country') ?? '',
      teamId: sp.get('teamId') ?? '',
    };
  }, [raw]);
  const set = useCallback(
    (patch: Partial<DemographicsFilters>) => {
      const sp = new URLSearchParams(raw);
      for (const [k, v] of Object.entries(patch)) {
        if (v) sp.set(k, String(v));
        else sp.delete(k);
      }
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [raw, pathname, router],
  );
  return { filters, set };
}

export function DemographicsTab({ teams = [] }: { teams?: { id: string; name: string }[] }) {
  const { filters, set } = useDemographicsFilters();
  const { data, isLoading, isError, error, refetch } = useDemographics(filters);

  return (
    <div className="space-y-4" data-testid="demographics-tab">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1 text-xs">
          Period
          <select
            aria-label="Period"
            className="rounded-md border bg-background px-2 py-1"
            value={filters.range}
            onChange={(e) => set({ range: e.target.value as DemographicsRange })}
          >
            {PICKABLE.map((r) => (
              <option key={r} value={r}>
                {RANGE_LABEL[r]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1 text-xs">
          Source
          <select
            aria-label="Source group"
            className="rounded-md border bg-background px-2 py-1"
            value={filters.sourceGroup}
            onChange={(e) => set({ sourceGroup: e.target.value })}
          >
            <option value="">All sources</option>
            {SOURCE_GROUPS.map((g) => (
              <option key={g} value={g}>
                {sourceGroupLabel(g)}
              </option>
            ))}
          </select>
        </label>
        <CountryFilter
          value={filters.country}
          options={data?.availableCountries ?? (filters.country ? [filters.country] : [])}
          onChange={(country) => set({ country })}
        />
        {teams.length > 0 && (
          <label className="flex items-center gap-1 text-xs">
            Team
            <select
              aria-label="Team"
              className="rounded-md border bg-background px-2 py-1"
              value={filters.teamId}
              onChange={(e) => set({ teamId: e.target.value })}
            >
              <option value="">All teams</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {data && <MethodologyPopover thresholds={data.thresholds} />}
        <span className="text-xs text-muted-foreground">
          Aggregated across all reps in scope, so there is no rep filter here.
        </span>
      </div>

      {isLoading && (
        <div className="grid gap-4 xl:grid-cols-2" aria-busy="true">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64 xl:col-span-2" />
        </div>
      )}

      {isError && (
        <div role="alert" className="rounded-lg border border-destructive/40 p-4 text-sm">
          {error instanceof Error ? error.message : 'Failed to load demographics'}{' '}
          <button type="button" className="underline" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      )}

      {data && (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            <ConversionByBandChart data={data} />
            <ChannelMixChart data={data} />
          </div>
          <ModelInterestHeatmap data={data} />
          <p className="text-xs text-muted-foreground" data-testid="demographics-footnote">
            Excluded: {data.excluded.unknownAge} leads with unknown age, {data.excluded.noModel}{' '}
            leads with no model selected.
          </p>
        </>
      )}
    </div>
  );
}
