'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { AssigneeDTO } from '@leaddesk/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { apiFetch } from '@/lib/api-client';
import { useRefresh } from './useRefresh';

const FLAGS: Record<string, string> = {
  de: '🇩🇪',
  en: '🇬🇧',
  fr: '🇫🇷',
  it: '🇮🇹',
  es: '🇪🇸',
  nl: '🇳🇱',
  pl: '🇵🇱',
  pt: '🇵🇹',
};

/** Searchable "Assign to…" picker: open count, language flags, "speaks X" marker, limit warning. */
export function AssignCombobox({
  teamId,
  leadId,
  leadIds,
  customerLanguage,
  version,
  label = 'Assign to…',
  allowPool = true,
  onDone,
}: {
  teamId: string;
  /** Single-lead mode. */
  leadId?: string;
  /** Bulk mode (takes precedence): ids sent to the bulk endpoint. */
  leadIds?: string[];
  customerLanguage?: string;
  version?: number;
  label?: string;
  allowPool?: boolean;
  onDone?: () => void;
}) {
  const refresh = useRefresh();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [people, setPeople] = useState<AssigneeDTO[] | null>(null);

  useEffect(() => {
    if (!open) return;
    const ref = leadId ?? leadIds?.[0];
    void apiFetch(`/api/teams/${teamId}/assignees${ref ? `?leadId=${ref}` : ''}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setPeople);
  }, [open, teamId, leadId, leadIds]);

  async function submit(toUserId: string | null, name: string) {
    const bulk = !!leadIds && leadIds.length > 0;
    const res = await apiFetch(bulk ? '/api/leads/assign' : `/api/leads/${leadId}/assign`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(bulk ? { leadIds, toUserId } : { toUserId, version }),
    });
    if (res.ok) {
      const body = await res.json();
      const n = bulk ? (body.assigned as number) : 1;
      const noun = `${n} lead${n === 1 ? '' : 's'}`;
      toast.success(toUserId ? `${noun} assigned to ${name}` : `${noun} returned to pool`);
      setOpen(false);
      onDone?.();
      refresh();
    } else {
      const { error } = await res.json().catch(() => ({ error: null }));
      toast.error(error?.message ?? 'Could not assign');
    }
  }

  const shown = (people ?? []).filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" data-testid="assign-trigger">
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        <Input
          placeholder="Search reps…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
        <ul className="mt-2 max-h-64 overflow-auto" role="listbox">
          {people === null && <li className="px-2 py-1 text-xs text-slate-400">Loading…</li>}
          {shown.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-slate-800"
                onClick={() => void submit(p.id, p.name)}
              >
                <span>
                  {p.name}
                  {p.languageMatch && customerLanguage && (
                    <span className="ml-1 text-xs text-emerald-400">
                      ✓ speaks {customerLanguage.toUpperCase()}
                    </span>
                  )}
                  {p.atLimit && (
                    <span className="block text-xs text-amber-400">
                      {p.name.split(' ')[0]} has {p.openLeads} open leads
                    </span>
                  )}
                </span>
                <span className="text-xs text-slate-400">
                  {p.openLeads} open {p.languages.map((l) => FLAGS[l] ?? l).join(' ')}
                </span>
              </button>
            </li>
          ))}
          {people !== null && shown.length === 0 && (
            <li className="px-2 py-1 text-xs text-slate-400">No matching reps</li>
          )}
        </ul>
        {allowPool && (
          <Button
            size="sm"
            variant="ghost"
            className="mt-2 w-full"
            onClick={() => void submit(null, '')}
          >
            Unassign → return to pool
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
