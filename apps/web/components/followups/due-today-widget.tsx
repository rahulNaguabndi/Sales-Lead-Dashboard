'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Clock, Mail, MessageCircle, MessageSquare, Phone } from 'lucide-react';
import type { Channel } from '@leaddesk/shared';
import { fetchFollowUps } from './api';
import { formatDueLabel } from './quick-picks';

const CHANNEL_ICON: Record<Channel, typeof Phone> = {
  CALL: Phone,
  WHATSAPP: MessageCircle,
  SMS: MessageSquare,
  EMAIL: Mail,
};
const PRIORITY_DOT: Record<string, string> = {
  HOT: 'bg-red-500',
  WARM: 'bg-amber-400',
  COOL: 'bg-sky-400',
};

/** Today's follow-ups, overdue first. Query key prefix ['follow-ups'] is invalidated on changes. */
export function DueTodayWidget() {
  const query = useQuery({
    queryKey: ['follow-ups', 'today'],
    queryFn: () => fetchFollowUps('today'),
    refetchInterval: 60_000,
  });
  const now = Date.now();

  return (
    <section
      aria-label="Today's follow-ups"
      data-testid="due-today-widget"
      className="rounded-lg border border-border bg-card p-3"
    >
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Today&rsquo;s follow-ups</h3>
        {query.data && (
          <span className="text-xs text-muted-foreground" data-testid="due-today-counts">
            Due today {query.data.counts.dueToday} · Overdue {query.data.counts.overdue}
          </span>
        )}
      </div>
      {query.isPending && <div className="h-10 animate-pulse rounded bg-muted" aria-busy />}
      {query.isError && (
        <p className="text-sm text-red-400">
          Could not load follow-ups.{' '}
          <button className="underline" onClick={() => void query.refetch()}>
            Retry
          </button>
        </p>
      )}
      {query.data && query.data.items.length === 0 && (
        <p className="text-sm text-muted-foreground">Nothing due today</p>
      )}
      <ul className="space-y-1">
        {query.data?.items.map((i) => {
          const Icon = CHANNEL_ICON[i.lead.preferredChannel];
          return (
            <li key={i.id}>
              <Link
                href={`/leads/${i.leadId}`}
                data-testid="due-today-item"
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
              >
                <span
                  aria-label={`Priority ${i.lead.priority}`}
                  className={`h-2 w-2 rounded-full ${PRIORITY_DOT[i.lead.priority] ?? 'bg-slate-400'}`}
                />
                <span className="flex-1 truncate">{i.lead.name}</span>
                <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                <span
                  className={
                    i.overdue
                      ? 'inline-flex items-center gap-1 font-medium text-red-400'
                      : 'text-muted-foreground'
                  }
                >
                  {i.overdue && <Clock className="h-3.5 w-3.5" aria-hidden />}
                  {formatDueLabel(i.dueAt, now)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
