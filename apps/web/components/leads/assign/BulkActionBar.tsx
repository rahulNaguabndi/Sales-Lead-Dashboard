'use client';

import { Button } from '@/components/ui/button';
import { AssignCombobox } from './AssignCombobox';

/** Sticky bar shown when inbox rows are selected: "5 selected · Assign to… · Clear". */
export function BulkActionBar({
  teamId,
  selectedIds,
  onClear,
}: {
  teamId: string;
  selectedIds: string[];
  onClear: () => void;
}) {
  if (selectedIds.length === 0) return null;
  return (
    <div
      className="sticky bottom-0 z-20 flex items-center gap-3 border-t border-slate-700 bg-slate-900 px-4 py-2"
      data-testid="bulk-bar"
    >
      <span className="text-sm">{selectedIds.length} selected</span>
      <AssignCombobox teamId={teamId} leadIds={selectedIds} onDone={onClear} />
      <Button size="sm" variant="ghost" onClick={onClear}>
        Clear
      </Button>
    </div>
  );
}
