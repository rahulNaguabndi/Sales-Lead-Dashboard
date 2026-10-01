'use client';

import { Button } from '@/components/ui/button';
import { AssignCombobox } from './AssignCombobox';

/** Sticky bar shown when inbox rows are selected: "5 selected · Assign to… · Clear". */
export function BulkActionBar({
  teamId,
  selectedIds,
  onClear,
}: {
  /** Null when the selection spans several teams (reps can only take leads of their own team). */
  teamId: string | null;
  selectedIds: string[];
  onClear: () => void;
}) {
  if (selectedIds.length === 0) return null;
  return (
    <div
      className="sticky bottom-0 z-20 flex flex-wrap items-center gap-3 rounded-md border border-slate-700 bg-slate-900 px-4 py-2"
      data-testid="bulk-bar"
      role="region"
      aria-label="Bulk actions"
    >
      <span className="text-sm">{selectedIds.length} selected</span>
      {teamId ? (
        <AssignCombobox teamId={teamId} leadIds={selectedIds} onDone={onClear} />
      ) : (
        <span className="text-xs text-amber-400">
          Select leads from one team to assign them together.
        </span>
      )}
      <Button size="sm" variant="ghost" onClick={onClear}>
        Clear
      </Button>
    </div>
  );
}
