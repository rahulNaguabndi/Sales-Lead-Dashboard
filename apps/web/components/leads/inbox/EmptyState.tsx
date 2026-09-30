import { Button } from '@/components/ui/button';

export type EmptyKind = 'no-leads' | 'unassigned' | 'filtered' | 'tab';

const COPY: Record<EmptyKind, { title: string; body: string; action?: string }> = {
  'no-leads': {
    title: 'No leads yet',
    body: 'Check the Unassigned tab to claim one.',
    action: 'Go to Unassigned',
  },
  unassigned: { title: 'All caught up', body: 'There are no unassigned leads right now.' },
  filtered: {
    title: 'No leads match',
    body: 'Try removing a filter or changing your search.',
    action: 'Clear filters',
  },
  tab: { title: 'Nothing here', body: 'No leads in this view.' },
};

export function EmptyState({ kind, onAction }: { kind: EmptyKind; onAction?: () => void }) {
  const c = COPY[kind];
  return (
    <div className="flex flex-col items-center gap-2 py-16 text-center" data-testid="inbox-empty">
      <p className="text-base font-semibold">{c.title}</p>
      <p className="text-slate-400">{c.body}</p>
      {c.action && onAction && (
        <Button variant="outline" size="sm" onClick={onAction}>
          {c.action}
        </Button>
      )}
    </div>
  );
}
