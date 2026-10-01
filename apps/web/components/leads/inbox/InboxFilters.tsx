'use client';

import {
  LEAD_SOURCES,
  PRIORITIES,
  STAGES,
  priorityLabel,
  sourceGroupLabel,
  sourceLabel,
  stageLabel,
  formatDate,
} from '@leaddesk/shared';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { activeFilterKeys, csvValues, toggleCsv, type InboxParams } from './inbox-params';

type Patch = Record<string, string | undefined>;

function CheckGroup({
  legend,
  options,
  selected,
  onToggle,
}: {
  legend: string;
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <fieldset className="space-y-1">
      <legend className="text-xs font-semibold uppercase text-slate-400">{legend}</legend>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {options.map((o) => (
          <label key={o.value} className="flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={selected.includes(o.value)}
              onChange={() => onToggle(o.value)}
              aria-label={`${legend}: ${o.label}`}
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const FLAG_LABELS: Record<string, string> = {
  team: 'Team',
  owner: 'Owner',
  stage: 'Stage',
  source: 'Source',
  priority: 'Priority',
  returning: 'Returning',
  overdue: 'Overdue',
  closed: 'Closed shown',
  sla: 'SLA breached',
  sourceGroup: 'Source group',
  createdFrom: 'From',
  createdTo: 'To',
  q: 'Search',
};

const dayLabel = (iso: string) => formatDate(iso);

type Named = { id: string; name: string };

function chipLabel(key: string, value: string, owners: Named[], teams: Named[]): string {
  if (key === 'team') {
    return `Team: ${csvValues(value)
      .map((v) => teams.find((t) => t.id === v)?.name ?? 'Other team')
      .join(', ')}`;
  }
  if (key === 'sourceGroup') return `Source: ${sourceGroupLabel(value)}`;
  if (key === 'createdFrom' || key === 'createdTo')
    return `${FLAG_LABELS[key]}: ${dayLabel(value)}`;
  if (key === 'owner') {
    return `Owner: ${csvValues(value)
      .map((v) => (v === 'unassigned' ? 'Unassigned' : (owners.find((o) => o.id === v)?.name ?? v)))
      .join(', ')}`;
  }
  if (key === 'source')
    return `Source: ${csvValues(value)
      .map((s) => sourceLabel(s as never))
      .join(', ')}`;
  if (key === 'stage' || key === 'priority') {
    const label = key === 'stage' ? stageLabel : priorityLabel;
    return `${key === 'stage' ? 'Stage' : 'Priority'}: ${csvValues(value).map(label).join(', ')}`;
  }
  const base = FLAG_LABELS[key] ?? key;
  return value === 'true' || value === 'breached' ? base : `${base}: ${value}`;
}

export function InboxFilters({
  leader,
  params,
  owners,
  teams = [],
  onPatch,
  onClear,
}: {
  leader: boolean;
  params: InboxParams;
  owners: { id: string; name: string }[];
  /** Teams in scope, so a dashboard drill-down chip reads "Team: Team DACH", not an id. */
  teams?: { id: string; name: string }[];
  onPatch: (patch: Patch) => void;
  onClear: () => void;
}) {
  const active = activeFilterKeys(params);
  const toggleBool = (key: string) =>
    onPatch({ [key]: params[key] === 'true' ? undefined : 'true' });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" data-testid="filters-trigger">
            Filters{active.length ? ` (${active.length})` : ''}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-96 space-y-3">
          <CheckGroup
            legend="Stage"
            options={STAGES.map((s) => ({ value: s, label: stageLabel(s) }))}
            selected={csvValues(params.stage)}
            onToggle={(v) => onPatch({ stage: toggleCsv(params.stage, v) })}
          />
          <CheckGroup
            legend="Source"
            options={LEAD_SOURCES.map((s) => ({ value: s, label: sourceLabel(s) }))}
            selected={csvValues(params.source)}
            onToggle={(v) => onPatch({ source: toggleCsv(params.source, v) })}
          />
          <CheckGroup
            legend="Priority"
            options={PRIORITIES.map((p) => ({ value: p, label: priorityLabel(p) }))}
            selected={csvValues(params.priority)}
            onToggle={(v) => onPatch({ priority: toggleCsv(params.priority, v) })}
          />
          {leader && (
            <CheckGroup
              legend="Owner"
              options={[
                ...owners.map((o) => ({ value: o.id, label: o.name })),
                { value: 'unassigned', label: 'Unassigned' },
              ]}
              selected={csvValues(params.owner)}
              onToggle={(v) => onPatch({ owner: toggleCsv(params.owner, v) })}
            />
          )}
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {(
              [
                ['returning', 'Returning customers'],
                ['overdue', 'Overdue follow-up'],
                ['sla', 'SLA breached'],
                ['closed', 'Show closed'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={params[key] === 'true' || params[key] === 'breached'}
                  onChange={() =>
                    key === 'sla'
                      ? onPatch({ sla: params.sla ? undefined : 'breached' })
                      : toggleBool(key)
                  }
                />
                {label}
              </label>
            ))}
          </div>
          <div className="flex gap-2 text-xs">
            <label className="flex items-center gap-1">
              From
              <input
                type="date"
                className="rounded border border-slate-700 bg-transparent px-1"
                value={params.createdFrom ?? ''}
                onChange={(e) => onPatch({ createdFrom: e.target.value || undefined })}
              />
            </label>
            <label className="flex items-center gap-1">
              To
              <input
                type="date"
                className="rounded border border-slate-700 bg-transparent px-1"
                value={params.createdTo ?? ''}
                onChange={(e) => onPatch({ createdTo: e.target.value || undefined })}
              />
            </label>
          </div>
        </PopoverContent>
      </Popover>

      {active.map((key) => (
        <span
          key={key}
          data-testid={`chip-filter-${key}`}
          className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2 py-0.5 text-xs"
        >
          {chipLabel(key, params[key]!, owners, teams)}
          <button
            type="button"
            aria-label={`Remove ${FLAG_LABELS[key] ?? key} filter`}
            onClick={() => onPatch({ [key]: undefined })}
            className="text-slate-400 hover:text-white"
          >
            ✕
          </button>
        </span>
      ))}
      {active.length > 0 && (
        <Button variant="ghost" size="sm" onClick={onClear} data-testid="clear-filters">
          Clear filters
        </Button>
      )}
    </div>
  );
}
