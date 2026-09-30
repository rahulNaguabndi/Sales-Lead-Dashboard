'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ASSIGN_STRATEGIES, type AssignStrategy, type TeamSettingsDTO } from '@leaddesk/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api-client';

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

export function TeamSettingsCard({ team }: { team: TeamSettingsDTO }) {
  const router = useRouter();
  const initialReps: RepState = Object.fromEntries(
    team.reps.map((r) => [r.id, { isActive: r.isActive, maxOpenLeads: r.maxOpenLeads }]),
  );
  const [autoAssign, setAutoAssign] = useState(team.autoAssign);
  const [strategy, setStrategy] = useState<AssignStrategy>(team.assignStrategy);
  const [reps, setReps] = useState<RepState>(initialReps);
  const [saved, setSaved] = useState({ autoAssign, strategy, reps: initialReps });
  const dirty =
    autoAssign !== saved.autoAssign ||
    strategy !== saved.strategy ||
    JSON.stringify(reps) !== JSON.stringify(saved.reps);

  async function save() {
    const changed = team.reps
      .filter((r) => JSON.stringify(reps[r.id]) !== JSON.stringify(saved.reps[r.id]))
      .map((r) => ({ id: r.id, ...reps[r.id]! }));
    const res = await apiFetch(`/api/teams/${team.id}/settings`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ autoAssign, assignStrategy: strategy, reps: changed }),
    });
    if (!res.ok) {
      toast.error((await res.json().catch(() => null))?.error?.message ?? 'Could not save');
      return;
    }
    setSaved({ autoAssign, strategy, reps });
    toast.success(
      `${team.name}: auto-assign ${autoAssign ? 'ON' : 'OFF'} (${STRATEGY[strategy].label})`,
    );
    router.refresh();
  }

  async function rebalance() {
    const res = await apiFetch(`/api/teams/${team.id}/rebalance`, { method: 'POST', body: '{}' });
    if (res.ok) toast.success(`Assigned ${(await res.json()).assigned} leads`);
    else toast.error('Could not rebalance');
    router.refresh();
  }

  async function returnToPool(repId: string) {
    const res = await apiFetch(`/api/leads?owner=${repId}&view=all&pageSize=50`);
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
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{team.name}</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            role="switch"
            checked={autoAssign}
            onChange={(e) => setAutoAssign(e.target.checked)}
            aria-label={`Auto-assign ${team.name}`}
          />
          Auto-assign {autoAssign ? 'ON' : 'OFF'}
        </label>
      </div>
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
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase text-slate-400">
          <tr>
            <th>Rep</th>
            <th>Open</th>
            <th>Languages</th>
            <th>Active</th>
            <th>Max open</th>
          </tr>
        </thead>
        <tbody>
          {team.reps.map((r) => (
            <tr key={r.id} className="border-t border-slate-800">
              <td className="py-1">
                {r.name}
                {!reps[r.id]!.isActive && r.openLeads > 0 && (
                  <button
                    type="button"
                    className="ml-2 text-xs text-amber-400 underline"
                    onClick={() => void returnToPool(r.id)}
                  >
                    Reassign {r.name.split(' ')[0]}&apos;s {r.openLeads} open leads?
                  </button>
                )}
              </td>
              <td>{r.openLeads}</td>
              <td>{r.languages.join(', ')}</td>
              <td>
                <input
                  type="checkbox"
                  role="switch"
                  aria-label={`Active ${r.name}`}
                  checked={reps[r.id]!.isActive}
                  onChange={(e) =>
                    setReps({ ...reps, [r.id]: { ...reps[r.id]!, isActive: e.target.checked } })
                  }
                />
              </td>
              <td>
                <Input
                  type="number"
                  min={1}
                  max={500}
                  className="h-8 w-20"
                  aria-label={`Max open leads ${r.name}`}
                  value={reps[r.id]!.maxOpenLeads}
                  onChange={(e) =>
                    setReps({
                      ...reps,
                      [r.id]: { ...reps[r.id]!, maxOpenLeads: Number(e.target.value) || 1 },
                    })
                  }
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex gap-2">
        <Button disabled={!dirty} onClick={() => void save()}>
          Save
        </Button>
        <Button variant="outline" onClick={() => void rebalance()}>
          Rebalance pool
        </Button>
      </div>
    </Card>
  );
}
