# Contract: scoring

## Shared (`packages/shared/src/scoring.ts`)
```ts
export const SCORING_WEIGHTS; export const PRIORITY_THRESHOLDS;
export function scoreLead(input: ScoreInput, now: number): ScoreResult;
export function slaStatus(lead: SlaInput, now: number): { status: SlaStatus; deadline: number | null };
```

## Server (`apps/web/server/services/scoring.ts`)
```ts
export function loadScoreInput(tx: Tx, leadId: string): ScoreInput;
export function recomputeLeadScore(tx: Tx, leadId: string, now: number):
  { changed: boolean; priorityChanged: boolean; before: Priority; result: ScoreResult };
export function recomputeFreshScores(now: number): { priorityChangedIds: string[] };
```

**Caller duties**: pass your own `tx`. After commit, if `changed`, publish `lead.updated { changes: { score, priority } }`. F06/F07/F10/F05 call on the FR-009 triggers; F08 schedules `recomputeFreshScores` every 5 minutes.
