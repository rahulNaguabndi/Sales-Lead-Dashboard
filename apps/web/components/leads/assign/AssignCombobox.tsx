'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { languageLabel, type AssigneeDTO } from '@leaddesk/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { apiFetch } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useRefresh } from './useRefresh';

/**
 * Searchable "Assign to…" picker: load vs cap, spoken languages, "speaks X" marker, an
 * over-capacity badge, the current owner marked, and Undo on every change.
 */
export function AssignCombobox({
  teamId,
  leadId,
  leadIds,
  currentOwnerId,
  customerLanguage,
  version,
  label = 'Assign to…',
  trigger,
  allowPool = true,
  onDone,
}: {
  teamId: string;
  /** Single-lead mode. */
  leadId?: string;
  /** Bulk mode (takes precedence): ids sent to the bulk endpoint. */
  leadIds?: string[];
  /** Single-lead mode: marks the current owner and enables Undo. */
  currentOwnerId?: string | null;
  customerLanguage?: string;
  version?: number;
  label?: string;
  /** Custom trigger element (e.g. the owner avatar on a board card). */
  trigger?: ReactNode;
  allowPool?: boolean;
  onDone?: () => void;
}) {
  const refresh = useRefresh();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [people, setPeople] = useState<AssigneeDTO[] | null>(null);
  const bulk = !!leadIds && leadIds.length > 0;

  useEffect(() => {
    if (!open) return;
    const ref = leadId ?? leadIds?.[0];
    void apiFetch(`/api/teams/${teamId}/assignees${ref ? `?leadId=${ref}` : ''}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setPeople);
  }, [open, teamId, leadId, leadIds]);

  async function send(toUserId: string | null): Promise<boolean> {
    const res = await apiFetch(bulk ? '/api/leads/assign' : `/api/leads/${leadId}/assign`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // Undo re-sends without a version: the first change already bumped it.
      body: JSON.stringify(bulk ? { leadIds, toUserId } : { toUserId }),
    });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: null }));
      toast.error(error?.message ?? 'Could not assign');
      return false;
    }
    return true;
  }

  async function submit(person: AssigneeDTO | null) {
    if (
      person?.atLimit &&
      !window.confirm(
        `${person.name} already has ${person.openLeads} open leads (cap ${person.maxOpenLeads}). Assign anyway?`,
      )
    ) {
      return;
    }
    const toUserId = person?.id ?? null;
    const res = await apiFetch(bulk ? '/api/leads/assign' : `/api/leads/${leadId}/assign`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(bulk ? { leadIds, toUserId } : { toUserId, version }),
    });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: null }));
      toast.error(error?.message ?? 'Could not assign');
      return;
    }
    const body = await res.json();
    const n = bulk ? (body.assigned as number) : 1;
    const noun = `${n} lead${n === 1 ? '' : 's'}`;
    const previous = currentOwnerId === undefined ? undefined : currentOwnerId;
    // Undo is offered whenever we know where the lead came from (single-lead mode).
    const undo =
      !bulk && previous !== undefined
        ? {
            label: 'Undo',
            onClick: () =>
              void send(previous).then((ok) => {
                if (ok) {
                  toast.success('Change undone');
                  refresh(leadId);
                }
              }),
          }
        : undefined;
    toast.success(person ? `${noun} assigned to ${person.name}` : `${noun} returned to pool`, {
      action: undo,
      duration: undo ? 8000 : undefined,
    });
    setOpen(false);
    onDone?.();
    refresh(leadId);
  }

  const shown = (people ?? []).filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline" data-testid="assign-trigger">
            {label}
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2" align="start" onClick={(e) => e.stopPropagation()}>
        <Input
          placeholder="Search reps…"
          aria-label="Search reps"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
        <ul className="mt-2 max-h-64 overflow-auto" role="listbox" aria-label="Reps">
          {people === null && <li className="px-2 py-1 text-xs text-slate-400">Loading…</li>}
          {shown.map((p) => {
            const isCurrent = !bulk && p.id === currentOwnerId;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isCurrent}
                  disabled={isCurrent}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-slate-800',
                    isCurrent && 'cursor-default opacity-60 hover:bg-transparent',
                  )}
                  onClick={() => void submit(p)}
                >
                  <span className="min-w-0">
                    <span className="truncate">{p.name}</span>
                    {isCurrent && (
                      <span className="ml-1 text-xs text-slate-400">(current owner)</span>
                    )}
                    {p.languageMatch && customerLanguage && (
                      <span className="ml-1 text-xs text-emerald-400">
                        ✓ speaks {languageLabel(customerLanguage)}
                      </span>
                    )}
                    {p.atLimit && (
                      <span className="mt-0.5 block w-fit rounded bg-amber-500/15 px-1.5 text-xs text-amber-400">
                        Over capacity
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-right text-xs text-slate-400">
                    <span className={cn('tabular-nums', p.atLimit && 'text-amber-400')}>
                      {p.openLeads} / {p.maxOpenLeads} open
                    </span>
                    <span className="block">{p.languages.map(languageLabel).join(' · ')}</span>
                  </span>
                </button>
              </li>
            );
          })}
          {people !== null && shown.length === 0 && (
            <li className="px-2 py-1 text-xs text-slate-400">No matching reps</li>
          )}
        </ul>
        {allowPool && (bulk || currentOwnerId !== null) && (
          <Button
            size="sm"
            variant="ghost"
            className="mt-2 w-full"
            onClick={() => void submit(null)}
          >
            Unassign → return to pool
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
