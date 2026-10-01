'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { avatarStyle } from '@/lib/utils';
import type { LeadSlotProps } from '@/components/leads/detail/types';
import { fetchLeadFollowUps, patchFollowUp } from './api';
import { AtRiskBadge } from './at-risk-badge';
import { formatDueLabel, resolveSnooze } from './quick-picks';
import { SchedulePopover } from './schedule-popover';

/** "Next follow-up" card for the lead detail right column (registered in slots.tsx). */
export function FollowUpCard({ lead, permissions }: LeadSlotProps) {
  const qc = useQueryClient();
  const key = ['leads', lead.id, 'follow-ups'];
  const query = useQuery({ queryKey: key, queryFn: () => fetchLeadFollowUps(lead.id) });
  const [scheduling, setScheduling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canAct = permissions.canLogActivity;

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: key });
    // The personal widget only; inbox lists refresh from the follow-up's live event. Invalidating
    // the whole ['leads'] prefix here restarted this card's own fetch and delayed the update.
    void qc.invalidateQueries({ queryKey: ['followups'] });
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const next = query.data?.items[0];
  const now = Date.now();
  // Once the outreach cadence is finished, a past-due follow-up is a wrap-up task, not an alarm.
  const cadenceDone = query.data?.cadence.done ?? false;
  const pastDue = next ? next.dueAt < now : false;
  const overdue = pastDue && !cadenceDone;

  return (
    <section
      aria-label="Next follow-up"
      data-testid="followup-card"
      className="space-y-2 rounded-lg border border-border bg-card p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Next follow-up</h3>
        {query.data?.atRisk.atRisk && <AtRiskBadge idleDays={query.data.atRisk.idleDays} />}
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

      {query.data && !next && (
        <p className="text-sm text-muted-foreground" data-testid="followup-empty">
          No follow-up scheduled
        </p>
      )}

      {next && (
        <div className="space-y-2" data-testid="followup-next">
          <div className="flex items-center gap-2 text-sm">
            <span
              aria-hidden
              className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold"
              style={avatarStyle(next.assigneeColor ?? '#64748b')}
              title={next.assigneeName ?? undefined}
            >
              {(next.assigneeName ?? '?')
                .split(' ')
                .map((p) => p[0])
                .join('')
                .slice(0, 2)}
            </span>
            {next.assigneeName && (
              <span className="text-xs text-muted-foreground">{next.assigneeName}</span>
            )}
            <span
              className={overdue ? 'inline-flex items-center gap-1 font-medium text-red-400' : ''}
              data-testid="followup-due"
            >
              {overdue && <Clock className="h-3.5 w-3.5" aria-hidden />}
              {pastDue && cadenceDone ? (
                <span className="text-amber-400">Wrap up · {formatDueLabel(next.dueAt, now)}</span>
              ) : (
                formatDueLabel(next.dueAt, now)
              )}
            </span>
          </div>
          {next.note && <p className="text-xs text-muted-foreground">{next.note}</p>}
          {canAct && (
            <div className="flex flex-wrap gap-1">
              <Button
                size="sm"
                disabled={busy}
                onClick={() => void run(() => patchFollowUp(next.id, { action: 'complete' }))}
              >
                Done
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    patchFollowUp(next.id, {
                      action: 'snooze',
                      dueAt: resolveSnooze('plus1h').getTime(),
                    }),
                  )
                }
              >
                Snooze +1 h
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    patchFollowUp(next.id, {
                      action: 'snooze',
                      dueAt: resolveSnooze('tomorrow').getTime(),
                    }),
                  )
                }
              >
                Snooze tomorrow
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => void run(() => patchFollowUp(next.id, { action: 'cancel' }))}
              >
                Cancel
              </Button>
            </div>
          )}
        </div>
      )}

      {query.data && (
        <p className="text-xs text-muted-foreground" data-testid="followup-cadence">
          {query.data.cadence.label}
        </p>
      )}

      {canAct && (
        <Button size="sm" variant="outline" onClick={() => setScheduling((v) => !v)}>
          {next ? 'Reschedule' : 'Schedule'}
        </Button>
      )}
      {scheduling && (
        <SchedulePopover
          leadId={lead.id}
          onScheduled={refresh}
          onClose={() => setScheduling(false)}
        />
      )}
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
    </section>
  );
}
