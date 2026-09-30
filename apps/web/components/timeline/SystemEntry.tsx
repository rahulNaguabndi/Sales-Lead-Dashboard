import type { ActivityItem } from '@/components/leads/detail/types';
import { formatSystemActivity } from './formatSystemActivity';
import { RelativeTime } from './RelativeTime';

/** Compact, muted line for automatic events. */
export function SystemEntry({ item }: { item: ActivityItem }) {
  return (
    <li className="flex items-center gap-2 px-3 py-1 text-xs text-muted-foreground">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
      <span className="min-w-0 flex-1 truncate">
        {formatSystemActivity(item.type, item.metadata)}
        {item.actor ? ` · ${item.actor.name}` : ' · System'}
      </span>
      <RelativeTime at={item.createdAt} />
    </li>
  );
}
