'use client';

import type { Role } from '@leaddesk/shared';
import type { TabCounts } from '@/server/services/lead-query';
import { cn } from '@/lib/utils';

type TabDef = { view: string; label: string; count?: number };

export function buildTabs(role: Role, counts: TabCounts): TabDef[] {
  const tabs: TabDef[] = [];
  if (role !== 'REP') tabs.push({ view: 'team', label: role === 'VP' ? 'All' : 'Team' });
  // Managers and VPs only get My Leads when they own at least one lead (open question, section 11).
  if (role === 'REP' || counts.mine > 0) {
    tabs.push({ view: 'mine', label: 'My Leads', count: counts.mine });
  }
  tabs.push(
    { view: 'unassigned', label: 'Unassigned', count: counts.unassigned },
    { view: 'due_today', label: 'Due Today', count: counts.dueToday },
    { view: 'going_cold', label: 'Going Cold', count: counts.goingCold },
  );
  return tabs;
}

export function InboxTabs({
  role,
  counts,
  active,
  onSelect,
}: {
  role: Role;
  counts: TabCounts;
  active: string;
  onSelect: (view: string) => void;
}) {
  return (
    <div role="tablist" aria-label="Lead views" className="flex flex-wrap gap-1">
      {buildTabs(role, counts).map((t) => (
        <button
          key={t.view}
          role="tab"
          type="button"
          aria-selected={active === t.view}
          data-testid={`tab-${t.view}`}
          onClick={() => onSelect(t.view)}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm transition-colors',
            active === t.view ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800',
          )}
        >
          {t.label}
          {t.count !== undefined && (
            <span className="ml-1.5 rounded-full bg-slate-700/60 px-1.5 text-xs tabular-nums">
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
