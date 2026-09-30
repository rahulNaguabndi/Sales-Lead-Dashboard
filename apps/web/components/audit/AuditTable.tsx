'use client';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AuditRow } from './AuditRow';
import type { AuditItemDto } from './types';

type Props = {
  items: AuditItemDto[];
  loading: boolean;
  error: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onRetry: () => void;
};

export function AuditTable({ items, loading, error, hasMore, loadingMore, onLoadMore, onRetry }: Props) {
  if (loading)
    return (
      <div className="space-y-2" aria-busy="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  if (error)
    return (
      <div role="alert" className="rounded border p-4 text-sm">
        Could not load the audit log.{' '}
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  if (items.length === 0)
    return (
      <p className="rounded border p-6 text-center text-sm text-muted-foreground">
        No audit entries match these filters.
      </p>
    );
  return (
    <div>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th className="p-2">Time</th>
            <th className="p-2">Actor</th>
            <th className="p-2">Action</th>
            <th className="p-2">Entity</th>
            <th className="p-2">Summary</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <AuditRow key={i.id} item={i} />
          ))}
        </tbody>
      </table>
      {hasMore && (
        <div className="p-3 text-center">
          <Button variant="outline" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  );
}
