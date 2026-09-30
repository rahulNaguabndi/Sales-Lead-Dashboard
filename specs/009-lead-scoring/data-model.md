# Data Model: F09

No schema changes. Reads and writes existing columns.

**Reads**: `leads` (intent fields, source, stage, created_at, first_response_at, customer_id, score, priority, score_breakdown), `customers.is_returning`, `purchases.purchased_at` (max per customer), `activities` (latest 20 USER rows by `created_at` desc: `outcome`).

**Writes**: `leads.score`, `leads.priority`, `leads.score_breakdown`, `leads.updated_at`; `activities` insert (`kind=SYSTEM`, `type=SCORE_CHANGED`, `metadata={from,to,score}`) on a band change; `audit_log` via F01 `writeAudit`.

## Types
```ts
ScoreInput / ScoreResult   // F09 §4
SlaInput  { stage: Stage; priority: Priority; createdAt: number; hasContact: boolean }
SlaResult { status: 'BREACHED' | 'DUE_SOON' | 'OK' | 'NA'; deadline: number | null }
```

## Rules
- Frozen stages: WON, LOST (never recomputed). COLD is recomputed.
- Bands: HOT ≥ 70, WARM 40–69, COOL < 40.
- Unanswered attempts = consecutive NO_ANSWER/VOICEMAIL USER outcomes counted from the newest backwards until a meaningful outcome.
