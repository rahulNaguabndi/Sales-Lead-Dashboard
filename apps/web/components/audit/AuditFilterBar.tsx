'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FILTER_KEYS, type AuditFilterState } from './types';

const ACTION_GROUPS: [string, string][] = [
  ['Any action', ''],
  ['Lead (all)', 'lead.*'],
  ['Activity (all)', 'activity.*'],
  ['Follow-up (all)', 'follow_up.*'],
  ['Offer (all)', 'offer.*'],
  ['Team settings', 'team.*'],
  ['Auth (all)', 'auth.*'],
];
const ENTITIES = ['', 'lead', 'activity', 'follow_up', 'offer', 'customer', 'team', 'user', 'auth'];

const toDateInput = (ms?: string) => (ms ? new Date(Number(ms)).toISOString().slice(0, 10) : '');
const dayMs = (s: string, end: boolean) =>
  s ? String(new Date(`${s}T${end ? '23:59:59.999' : '00:00:00.000'}Z`).getTime()) : '';

type Props = {
  value: AuditFilterState;
  onChange: (next: AuditFilterState) => void;
  actors: { id: string; name: string }[];
};

export function AuditFilterBar({ value, onChange, actors }: Props) {
  const set = (k: keyof AuditFilterState, v: string) => onChange({ ...value, [k]: v || undefined });
  const active = FILTER_KEYS.some((k) => value[k]);
  const sel = 'block h-9 rounded-md border bg-background px-2 text-sm';
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => e.preventDefault()}
      aria-label="Audit filters"
    >
      <label className="text-xs">
        From
        <Input
          type="date"
          value={toDateInput(value.from)}
          onChange={(e) => set('from', dayMs(e.target.value, false))}
        />
      </label>
      <label className="text-xs">
        To
        <Input
          type="date"
          value={toDateInput(value.to)}
          onChange={(e) => set('to', dayMs(e.target.value, true))}
        />
      </label>
      <label className="text-xs">
        Actor
        <select className={sel} value={value.actorId ?? ''} onChange={(e) => set('actorId', e.target.value)}>
          <option value="">Anyone</option>
          {actors.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs">
        Action
        <select className={sel} value={value.action ?? ''} onChange={(e) => set('action', e.target.value)}>
          {ACTION_GROUPS.map(([l, v]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs">
        Entity type
        <select className={sel} value={value.entity ?? ''} onChange={(e) => set('entity', e.target.value)}>
          {ENTITIES.map((e) => (
            <option key={e} value={e}>
              {e || 'Any'}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs">
        Lead reference
        <Input
          placeholder="EDM-2026-00812"
          defaultValue={value.leadRef ?? ''}
          onBlur={(e) => set('leadRef', e.target.value.trim())}
          onKeyDown={(e) => e.key === 'Enter' && set('leadRef', e.currentTarget.value.trim())}
        />
      </label>
      {active && (
        <Button type="button" variant="ghost" onClick={() => onChange({})}>
          Clear filters
        </Button>
      )}
    </form>
  );
}
