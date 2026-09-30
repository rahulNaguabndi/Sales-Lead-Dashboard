'use client';

import {
  SCORING_WEIGHTS,
  explainScore,
  type Priority,
  type ScoreBreakdownValues,
  type ScoreFactor,
  type ScoreInput,
} from '@leaddesk/shared';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';

const PRIORITY_STYLES: Record<Priority, string> = {
  HOT: 'bg-red-600 text-white',
  WARM: 'bg-amber-500 text-black',
  COOL: 'bg-sky-500 text-white',
};

const FACTORS: { key: ScoreFactor; label: string; max: number }[] = [
  { key: 'intent', label: 'Intent', max: SCORING_WEIGHTS.intent.max },
  { key: 'source', label: 'Source', max: SCORING_WEIGHTS.sourceMax },
  { key: 'customer', label: 'Customer', max: SCORING_WEIGHTS.customer.max },
  { key: 'freshness', label: 'Freshness', max: SCORING_WEIGHTS.freshness.max },
  { key: 'engagement', label: 'Engagement', max: SCORING_WEIGHTS.engagement.max },
];

export interface ScoreBadgeProps {
  score: number;
  priority: Priority;
  breakdown: ScoreBreakdownValues;
  /** When given, plain-language reasons are derived with the same rules as the stored score. */
  scoreInput?: ScoreInput;
  /** Timestamp the score was last calculated (ms), shown in the popover footer. */
  updatedAt?: number;
  now?: number;
  className?: string;
}

/** Priority chip that shows its number as text; click or focus opens the five-factor breakdown. */
export function ScoreBadge({
  score,
  priority,
  breakdown,
  scoreInput,
  updatedAt,
  now = Date.now(),
  className,
}: ScoreBadgeProps) {
  const reasons = scoreInput ? explainScore(scoreInput, now).reasons : [];
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`Lead score ${score}, ${priority}. Show breakdown`}
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          PRIORITY_STYLES[priority],
          className,
        )}
      >
        <span>{priority}</span>
        <span className="tabular-nums">{score}</span>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-3">
        <p className="text-sm font-semibold">
          Score {score} / 100 · {priority}
        </p>
        <ul className="space-y-2">
          {FACTORS.map(({ key, label, max }) => (
            <li key={key} className="text-xs">
              <div className="flex justify-between">
                <span>{label}</span>
                <span className="tabular-nums">
                  {breakdown[key]} / {max}
                </span>
              </div>
              <div
                role="progressbar"
                aria-label={label}
                aria-valuemin={0}
                aria-valuemax={max}
                aria-valuenow={breakdown[key]}
                className="mt-1 h-1.5 rounded bg-muted"
              >
                <div
                  className="h-full rounded bg-foreground/70"
                  style={{ width: `${Math.min(100, (breakdown[key] / max) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
        {reasons.length > 0 && (
          <ul className="space-y-0.5 text-xs text-muted-foreground">
            {reasons.map((r, i) => (
              <li key={`${r.factor}-${i}`}>
                {r.label} {r.points >= 0 ? '+' : '−'}
                {Math.abs(r.points)}
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] text-muted-foreground">
          Rule-based score{updatedAt ? ` · updated ${formatRelative(updatedAt, now)}` : ''}
        </p>
      </PopoverContent>
    </Popover>
  );
}
