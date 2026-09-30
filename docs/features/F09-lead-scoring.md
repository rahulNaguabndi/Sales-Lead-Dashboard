# F09 — Lead Scoring & Priority

| Field | Value |
|---|---|
| **ID** | F09 |
| **Priority** | P1 |
| **Build wave** | 1 |
| **Depends on** | F01 |
| **Blocks** | F06 (recompute on activity), F10 (score on intake). Also used by F04 (sorting and badges), F05 ("why this score"), F07, F08 |
| **Personas** | REP (what to work next), MANAGER (spot hot neglected leads) |
| **Challenge req.** | — (supports R1 inbox ranking) |
| **Owns (files/areas)** | `packages/shared/src/scoring.ts` (pure function, weights, SLA helpers), `apps/web/server/services/scoring.ts` (load, recompute, persist), `apps/web/server/db/seed/score-step.ts` (**sanctioned edit**: replace the F01 stub), `apps/web/components/leads/score/**` (score badge + breakdown popover) |

## 1. Summary
Every lead gets a transparent **0–100 score**. It's built from five explainable factors: intent, source quality, customer value, freshness, and engagement. The score maps to a **priority band** (HOT / WARM / COOL). On top of that, **SLA flags** mark new leads that haven't been answered fast enough. The scoring rules are a **pure function** in the shared package, so the web app, the seed, and tests use the same logic. The score's breakdown is shown to reps ("why this score"). The score is recomputed whenever something relevant changes.

## 2. User Stories & Acceptance Scenarios

### US-1 (P1): Know which lead to work next
*As a rep, I want each lead to carry a priority so that I contact the most promising ones first.*

**Independent test:** Call `scoreLead()` with the §9 worked examples and compare the outputs.

1. **Given** a referral lead from a returning customer who wants a test drive and was last "Interested", **When** it's scored, **Then** it's HOT (≥ 70).
2. **Given** an 8-day-old social lead with 3 unanswered calls, **When** it's scored, **Then** it's COOL (< 40).

### US-2 (P1): Understand why
*As a rep or manager, I want to see how a score was built so that I trust it and know what to improve.*

1. **Given** a lead detail page, **When** I hover or click the score badge, **Then** I see the five factor values with their maximums and plain-language reasons (for example "Test drive requested +12", "2 unanswered attempts −6").

### US-3 (P1): Scores stay current
*As a rep, I want the score to update when I log an activity or time passes so that priorities reflect reality.*

1. **Given** a WARM lead, **When** I log an activity with outcome INTERESTED, **Then** its engagement becomes 15 and the score and priority update in the same transaction.
2. **Given** a lead created 50 min ago with freshness 20, **When** the freshness recompute runs after it's 1 h old, **Then** freshness becomes 15.
3. **Given** a priority change (for example WARM → HOT), **Then** a `SCORE_CHANGED` system activity is written and a `lead.updated` event is published. A score change within the same band only updates the lead (no timeline noise).

### US-4 (P1): Response-time SLA
*As a manager, I want new leads that nobody has answered in time to be flagged so that I can intervene.*

1. **Given** a HOT lead in stage NEW with no contact activity, 16 minutes old, **Then** `slaStatus` = `BREACHED`.
2. **Given** a WARM lead in stage NEW, 100 minutes old, **Then** `slaStatus` = `DUE_SOON` (within the last 25% of the 2 h window).
3. **Given** any lead with a contact activity or stage ≠ NEW, **Then** `slaStatus` = `NA`.

## 3. Functional Requirements
- **FR-001**: `scoreLead(input: ScoreInput, now: number): ScoreResult` MUST be pure and deterministic (no I/O, no `Date.now()`).
- **FR-002**: Factor rules (weights exported as the constant `SCORING_WEIGHTS`, so they can be tuned in one place):

| Factor | Max | Rule |
|---|---|---|
| **Intent** | 35 | test drive requested +12 · wants finance +5 · has trade-in +5 · budget given (min or max) +5 · specific vehicle model +4 · message > 30 chars after trim +4 |
| **Source** | 15 | REFERRAL 15 · WALK_IN 14 · PHONE 12 · WEBSITE 10 · GOOGLE_ADS 8 · PORTAL 6 · FACEBOOK 5 · INSTAGRAM 5 |
| **Customer** | 15 | returning customer +10 · a purchase within the last 5 years +5 |
| **Freshness** | 20 | age since `created_at`: < 1 h → 20 · < 24 h → 15 · < 72 h → 10 · < 168 h → 5 · otherwise 0 |
| **Engagement** | 15 | base from the most recent USER outcome that isn't NO_ANSWER/VOICEMAIL: INTERESTED 15 · CALLBACK_REQUESTED 10 · CONNECTED 6 · NOT_INTERESTED 0 · none 0. Then subtract 3 × `unansweredAttempts` (consecutive NO_ANSWER/VOICEMAIL outcomes after that base outcome). Floor at 0 |

- **FR-003**: `score` = the sum of the factors, clamped to 0–100 and rounded to an integer.
- **FR-004**: Priority bands: **HOT** ≥ 70 · **WARM** 40–69 · **COOL** < 40 (exported as `PRIORITY_THRESHOLDS`).
- **FR-005**: `ScoreResult` MUST include `breakdown` (5 numbers) and `reasons: { factor, label, points }[]` (human-readable, English), used by the UI.
- **FR-006**: `slaStatus(lead, now)` MUST return `BREACHED | DUE_SOON | OK | NA`. It applies only when stage = NEW and there's no contact activity (USER, type ≠ NOTE; equivalently `first_response_at` null). The target is 15 min for HOT and 120 min otherwise. `DUE_SOON` covers the final 25% of the target. It also returns `slaDeadline` (ms).
- **FR-007**: Closed leads (WON, LOST) MUST keep the score they had at closing. The recompute skips them. COLD leads are recomputed normally.
- **FR-008**: `recomputeLeadScore(tx, leadId, now, opts?)` (server service) MUST load the inputs (lead, customer returning/purchase info, last outcomes), call `scoreLead`, and update `score`, `priority`, `score_breakdown`, `updated_at` only if something changed. When the band changes, it writes a `SCORE_CHANGED` system activity (`metadata: {from, to, score}`) and returns `{ changed, priorityChanged, result }`, so the caller can publish `lead.updated` after commit.
- **FR-009**: Recompute triggers (the caller is responsible and passes its transaction):

| Trigger | Caller |
|---|---|
| Lead created via intake | F10 |
| USER activity logged (outcome, attempt count) | F06 |
| Stage change | F07 |
| Lead intent fields edited | F05/F07 |
| Customer marked returning (dedupe) | F10 |
| Freshness decay: open leads younger than 8 days, every 5 min | `recomputeFreshScores(now)` exported here, scheduled by F08's job runner |

- **FR-010**: `recomputeFreshScores(now)` MUST process in batches of 200 in one transaction per batch and return the ids whose priority changed (so the caller can publish events).
- **FR-011**: The seed step (`score-step.ts`) MUST use `scoreLead` with the seed's `now`, so seeded leads carry real scores and breakdowns.
- **FR-012**: `<ScoreBadge score priority breakdown reasons/>` MUST render a colored chip ("HOT 82") with a popover showing the breakdown bars and reasons. `<SlaBadge status deadline/>` renders "Respond now · 4 min left" or "SLA breached · 12 min over".

## 4. Key Entities & Data
- `leads`: score, priority, score_breakdown, attempt_count, test_drive_requested, wants_finance, has_trade_in, budget_min/max, vehicle_model, message, source, created_at, first_response_at, stage.
- `customers`: whether they're returning (derived: has another lead older than this one, or a purchase). `purchases.purchased_at`.
- `activities`: USER outcomes in time order (for engagement).

```ts
export interface ScoreInput {
  testDriveRequested: boolean; wantsFinance: boolean; hasTradeIn: boolean;
  budgetMin: number | null; budgetMax: number | null; vehicleModel: string | null; message: string | null;
  source: LeadSource; isReturning: boolean; lastPurchaseAt: number | null;
  createdAt: number; lastPositiveOutcome: Outcome | null; unansweredAttempts: number;
}
export interface ScoreResult {
  score: number; priority: Priority;
  breakdown: { intent: number; source: number; customer: number; freshness: number; engagement: number };
  reasons: { factor: keyof ScoreResult['breakdown']; label: string; points: number }[];
}
```

## 5. Edge Cases & Error Handling
- `createdAt` in the future (clock skew or bad data) → treat the age as 0 (freshness 20).
- Budget of 0 → counts as "given" only if > 0.
- Message of only whitespace or emoji → trimmed length is used. Emoji count by code points (`[...str].length`).
- NOT_INTERESTED as the latest outcome → engagement 0. That's intentional. The rep usually also moves the lead to LOST.
- Many unanswered attempts → engagement floors at 0 (never negative, so the total never drops below the other factors).
- Unknown enum value from old data → source points 0 and a logged warning.
- A lead reassigned to someone else doesn't change the score (ownership isn't a factor).

## 6. Success Criteria
- **SC-001**: 100% of the §9 worked examples match exactly in unit tests.
- **SC-002**: `scoreLead` runs in < 0.05 ms per call (1,000 leads in < 50 ms).
- **SC-003**: In the seeded data, priority distribution across open leads lands roughly at HOT 15–25%, WARM 40–55%, COOL 25–40%. If it doesn't, adjust the thresholds and record the change in Decisions.
- **SC-004**: Reps can name the top two reasons for any lead's score from the UI without documentation (checked in the demo).

## 7. UX Notes
- Priority chip colors: HOT red-600, WARM amber-500, COOL sky-500. Always show the text (not color-only) plus the number.
- Breakdown popover: five horizontal bars (value/max) with the reasons listed below, and a footer: "Rule-based score · updated 3 min ago".
- SLA badge: pulses gently when BREACHED (respects `prefers-reduced-motion`).

## 8. Decisions
| # | Decision | Alternatives | Rationale |
|---|---|---|---|
| D1 | Rule-based additive score | ML model, LLM scoring | No training data. Transparent and deterministic. A baseline for ML later (ADR-007) |
| D2 | Pure function in `packages/shared` | Server-only service | Shared by seed, server, and tests. Showroom could preview it |
| D3 | Freshness from `created_at`, not last activity | Last-activity recency | Engagement already rewards activity. Freshness is about how fast new leads get answered |
| D4 | A timeline entry only on band change | Every score change | Avoids timeline spam, keeps traceability of what matters |
| D5 | A plain website lead with full intent maxes at 65 (WARM). HOT at intake needs a high-quality source or a returning customer | Lower the HOT threshold | HOT stays meaningful. It becomes HOT as soon as engagement is positive |
| D6 | SLA targets: 15 min HOT / 2 h others | One target for all | Industry practice: the fastest response wins hot leads |
| D7 | Thresholds stay 70/40 although the seeded open-lead mix lands near HOT 2% / WARM 32% / COOL 66% (SC-003 asks 15–25 / 40–55 / 25–40) | Retune thresholds to hit SC-003 | Worked examples A, A', D and boundary G fix the bands. Most seed leads are old with little intent, so the fix belongs in the seed generator (F01), not in F09 |

## 9. Technical Plan Input (for `/speckit.plan`)

**Worked examples** (all `now`-relative, used verbatim as unit tests)

| # | Lead | Intent | Source | Customer | Fresh | Engage | **Score** | **Band** |
|---|---|---|---|---|---|---|---|---|
| A | Anna Schmidt: WEBSITE, test drive, finance, trade-in, budget, aurora-suv, 45-char message, new customer, 5 min old, no activity | 35 | 10 | 0 | 20 | 0 | **65** | WARM |
| A' | Same as A but a returning customer (last purchase 7 years ago). **This is the UF-3 demo scenario** (02-user-flows) | 35 | 10 | 10 | 20 | 0 | **75** | HOT |
| B | INSTAGRAM, model chosen only, 10-char message, new, 2 days old, 2 unanswered attempts, no positive outcome | 4 | 5 | 0 | 10 | 0 | **19** | COOL |
| C | REFERRAL, returning with a purchase 3 years ago, test drive, finance, budget, model, 20 h old, last outcome INTERESTED | 26 | 15 | 15 | 15 | 15 | **86** | HOT |
| D | WALK_IN, test drive, trade-in, model, 50-char message, new, 4 days old, CALLBACK_REQUESTED then 1 NO_ANSWER | 25 | 14 | 0 | 5 | 7 | **51** | WARM |
| E | GOOGLE_ADS, finance, budget, new, 8 days old, 3 unanswered attempts | 10 | 8 | 0 | 0 | 0 | **18** | COOL |
| F | PHONE, test drive, model, new, 30 min old, outcome CONNECTED | 16 | 12 | 0 | 20 | 6 | **54** | WARM |
| G | Boundary: total exactly 70 → HOT, total exactly 40 → WARM, total 39 → COOL | | | | | | | |

**SLA examples:** HOT NEW, 16 min, no response → BREACHED. HOT NEW, 12 min → DUE_SOON (deadline 15, DUE_SOON after 11.25). WARM NEW, 100 min → DUE_SOON. WARM NEW, 30 min → OK. CONTACTED → NA.

**Server service** `server/services/scoring.ts`
```ts
export function loadScoreInput(tx: Tx, leadId: string): ScoreInput;
export function recomputeLeadScore(tx: Tx, leadId: string, now: number):
  { changed: boolean; priorityChanged: boolean; before: Priority; result: ScoreResult };
export function recomputeFreshScores(now: number): { priorityChangedIds: string[] };
```
Queries: the latest USER activities for the lead ordered desc (limit 20) to compute `lastPositiveOutcome` and `unansweredAttempts`. Returning = the stored column `customers.is_returning` (set by the seed, F10 dedupe and F07 on WON). `lastPurchaseAt = max(purchases.purchased_at)`.

**Events:** the caller publishes `lead.updated { changes: { score, priority } }` after commit when `changed`.

**Cache:** none (F20 may choose to invalidate inbox caches on `lead.updated`).

**Tests:** worked examples A–G, the SLA table, reasons text snapshot, clamping, future `createdAt`, and `recomputeLeadScore` writes SCORE_CHANGED only on a band change (integration with an in-memory DB). Seed distribution check (SC-003) as a non-blocking report test.

## 10. Out of Scope
- ML- or LLM-learned weights (future: train on WON/LOST, see F18/architecture scale path).
- Per-team custom weights UI.
- At-risk and cold detection (F08). Scoring only lowers freshness and engagement.

## 11. Open Questions
- Should NOT_INTERESTED subtract points instead of zeroing engagement? Proposed: no, keep it simple.
- Should HOT thresholds differ per team? Proposed: no for v1.

## 12. Spec Kit Prompts
**`/speckit.specify`**
> Each sales lead needs an easy-to-understand priority so reps know who to contact first. Give every lead a 0–100 score from five factors: purchase intent (test drive, financing, trade-in, budget, specific model, meaningful message), lead source quality (referral and walk-in highest, social lowest), customer value (returning customer, recent purchase), freshness (newer is better, decaying over a week), and engagement (the latest meaningful conversation outcome, minus points for consecutive unanswered attempts). Scores of 70 or more are HOT, 40–69 WARM, and below 40 COOL. Staff must be able to see how any score was made up. New leads nobody has answered within 15 minutes (HOT) or 2 hours (others) must be flagged, and flagged early as "due soon" in the last quarter of that window. Scores update when leads are created, activities are logged, stages change, and as time passes. A priority band change is recorded on the lead's timeline, and closed leads keep their final score.

**`/speckit.plan`**
> A pure TypeScript `scoreLead(input, now)` and `slaStatus(lead, now)` in `packages/shared/src/scoring.ts` with exported `SCORING_WEIGHTS` and `PRIORITY_THRESHOLDS`, following F09 FR-002…FR-006 exactly. A server service `apps/web/server/services/scoring.ts` with `loadScoreInput`, `recomputeLeadScore(tx, leadId, now)` (Drizzle, updates only on change, SCORE_CHANGED system activity on a band change), and `recomputeFreshScores(now)` in batches of 200 (scheduled later by F08's job runner). Replace F01's `seed/score-step.ts` stub to use `scoreLead`. React components `ScoreBadge` (shadcn Popover with breakdown bars) and `SlaBadge`. Vitest tests with the worked examples A–G and the SLA table from F09 §9.
