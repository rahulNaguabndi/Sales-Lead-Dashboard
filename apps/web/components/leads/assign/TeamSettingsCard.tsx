'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ASSIGN_STRATEGIES,
  MAX_OPEN_LEADS_LIMIT,
  languageLabel,
  type AssignStrategy,
  type TeamSettingsDTO,
} from '@leaddesk/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api-client';
import { cn } from '@/lib/utils';

const STRATEGY: Record<AssignStrategy, { label: string; hint: string }> = {
  LOAD_BALANCED: {
    label: 'Load balanced',
    hint: 'The rep with the fewest open leads gets the next one.',
  },
  LANGUAGE_MATCH: {
    label: 'Language match',
    hint: 'Prefers reps who speak the customer language, then the lightest load.',
  },
  ROUND_ROBIN: { label: 'Round robin', hint: 'Strict rotation through active reps by name.' },
};

type RepState = Record<string, { isActive: boolean; maxOpenLeads: number }>;

const capError = (n: number): string | null =>
  Number.isInteger(n) && n >= 1 && n <= MAX_OPEN_LEADS_LIMIT
    ? null
    : `Enter a whole number from 1 to ${MAX_OPEN_LEADS_LIMIT}`;

export function TeamSettingsCard({ team }: { team: TeamSettingsDTO }) {
  const router = useRouter();
  const initialReps: RepState = Object.fromEntries(
    team.reps.map((r) => [r.id, { isActive: r.isActive, maxOpenLeads: r.maxOpenLeads }]),
  );
  const [autoAssign, setAutoAssign] = useState(team.autoAssign);
  const [strategy, setStrategy] = useState<AssignStrategy>(team.assignStrategy);
  const [reps, setReps] = useState<RepState>(initialReps);
  const [saved, setSaved] = useState({ autoAssign, strategy, reps: initialReps });
  const [saving, setSaving] = useState(false);
  const [confirmRebalance, setConfirmRebalance] = useState(false);
  const dirty =
    autoAssign !== saved.autoAssign ||
    strategy !== saved.strategy ||
    JSON.stringify(reps) !== JSON.stringify(saved.reps);
  const invalid = team.reps.some((r) => capError(reps[r.id]!.maxOpenLeads) !== null);

  async function save() {
    if (invalid) return;
    setSaving(true);
    const changed = team.reps
      .filter((r) => JSON.stringify(reps[r.id]) !== JSON.stringify(saved.reps[r.id]))
      .map((r) => ({ id: r.id, ...reps[r.id]! }));
    const res = await apiFetch(`/api/teams/${team.id}/settings`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ autoAssign, assignStrategy: strategy, reps: changed }),
    }).finally(() => setSaving(false));
    if (!res.ok) {
      toast.error((await res.json().catch(() => null))?.error?.message ?? 'Could not save');
      return;
    }
    setSaved({ autoAssign, strategy, reps });
    toast.success(
      `${team.name}: auto-assign ${autoAssign ? 'on' : 'off'} (${STRATEGY[strategy].label})`,
    );
    router.refresh();
  }

  async function rebalance() {
    setConfirmRebalance(false);
    const res = await apiFetch(`/api/teams/${team.id}/rebalance`, { method: 'POST', body: '{}' });
    if (res.ok) {
      const { assigned } = await res.json();
      const left = team.poolSize - assigned;
      toast.success(
        `Assigned ${assigned} lead${assigned === 1 ? '' : 's'}${left > 0 ? `; ${left} left in the pool (reps at capacity or inactive)` : ''}`,
      );
    } else toast.error('Could not rebalance');
    router.refresh();
  }

  async function returnToPool(repId: string) {
    const res = await apiFetch(`/api/leads?owner=${repId}&view=team&pageSize=50`);
    const items: { id: string }[] = res.ok ? ((await res.json()).items ?? []) : [];
    if (items.length === 0) {
      toast.info('No open leads to reassign');
      return;
    }
    const r = await apiFetch('/api/leads/assign', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        leadIds: items.map((l) => l.id),
        toUserId: null,
        reason: 'Rep deactivated',
      }),
    });
    if (r.ok) toast.success(`${items.length} leads returned to pool`);
    else toast.error('Could not return leads to the pool');
    router.refresh();
  }

  return (
    <Card className="space-y-4 p-4" data-testid={`team-card-${team.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{team.name}</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            role="switch"
            checked={autoAssign}
            onChange={(e) => setAutoAssign(e.target.checked)}
            aria-label={`Auto-assign ${team.name}`}
          />
          Auto-assign {autoAssign ? 'on' : 'off'}
        </label>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <fieldset className="space-y-1" disabled={!autoAssign}>
          <legend className="text-xs uppercase text-slate-400">Strategy</legend>
          {ASSIGN_STRATEGIES.map((s) => (
            <label key={s} className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name={`strategy-${team.id}`}
                checked={strategy === s}
                onChange={() => setStrategy(s)}
              />
              <span>
                <span className="font-medium">{STRATEGY[s].label}</span>
                <span className="block text-xs text-slate-400">{STRATEGY[s].hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr>
                <th className="py-1 pr-3">Rep</th>
                <th className="py-1 pr-3">Open / max</th>
                <th className="py-1 pr-3">Languages</th>
                <th className="py-1 pr-3">Active</th>
                <th className="py-1">Max open leads</th>
              </tr>
            </thead>
            <tbody>
              {team.reps.map((r) => {
                const state = reps[r.id]!;
                const err = capError(state.maxOpenLeads);
                const over = r.openLeads > state.maxOpenLeads;
                return (
                  <tr key={r.id} className="border-t border-slate-800 align-top">
                    <td className="py-1.5 pr-3">
                      {r.name}
                      {!state.isActive && r.openLeads > 0 && (
                        <button
                          type="button"
                          className="ml-2 text-xs text-amber-400 underline"
                          onClick={() => void returnToPool(r.id)}
                        >
                          Reassign {r.name.split(' ')[0]}&apos;s {r.openLeads} open leads?
                        </button>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 tabular-nums">
                      <span className={cn(over && 'text-amber-400')}>
                        {r.openLeads} / {state.maxOpenLeads}
                      </span>
                      {over && (
                        <span className="ml-1.5 rounded bg-amber-500/15 px-1.5 text-xs text-amber-400">
                          Over capacity
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 pr-3">{r.languages.map(languageLabel).join(', ')}</td>
                    <td className="py-1.5 pr-3">
                      <input
                        type="checkbox"
                        role="switch"
                        aria-label={`Active ${r.name}`}
                        checked={state.isActive}
                        onChange={(e) =>
                          setReps({ ...reps, [r.id]: { ...state, isActive: e.target.checked } })
                        }
                      />
                    </td>
                    <td className="py-1.5">
                      <Input
                        type="number"
                        min={1}
                        max={MAX_OPEN_LEADS_LIMIT}
                        step={1}
                        className="h-8 w-20"
                        aria-label={`Max open leads ${r.name}`}
                        aria-invalid={err !== null}
                        value={Number.isNaN(state.maxOpenLeads) ? '' : state.maxOpenLeads}
                        onChange={(e) =>
                          setReps({
                            ...reps,
                            [r.id]: { ...state, maxOpenLeads: e.target.valueAsNumber },
                          })
                        }
                      />
                      {err && (
                        <p role="alert" className="mt-0.5 text-xs text-red-400">
                          {err}
                        </p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-slate-800 pt-3">
        <Button disabled={!dirty || invalid || saving} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
        <span className="text-xs text-slate-400" aria-live="polite">
          {dirty ? 'Unsaved changes' : 'All changes saved'}
        </span>
        <div className="ml-auto flex flex-col items-end gap-1">
          {confirmRebalance ? (
            <div className="flex flex-wrap items-center gap-2 text-sm" role="alertdialog">
              <span>
                Hand out up to {Math.min(team.poolSize, 100)} pool lead
                {team.poolSize === 1 ? '' : 's'} using {STRATEGY[strategy].label.toLowerCase()}?
              </span>
              <Button size="sm" onClick={() => void rebalance()}>
                Assign now
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmRebalance(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              disabled={!saved.autoAssign || team.poolSize === 0 || dirty}
              onClick={() => setConfirmRebalance(true)}
            >
              Rebalance pool ({team.poolSize})
            </Button>
          )}
          <p className="max-w-sm text-right text-xs text-slate-400">
            {!saved.autoAssign
              ? 'Turn auto-assign on and save to hand out pool leads.'
              : dirty
                ? 'Save your changes first.'
                : 'Assigns unassigned leads, oldest first, with the saved strategy. Reps at their max are skipped.'}
          </p>
        </div>
      </div>
    </Card>
  );
}
