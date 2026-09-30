# F08 — Follow-ups & Going-Cold Detection

| Field | Value |
|---|---|
| **ID** | F08 |
| **Priority** | P1 |
| **Build wave** | 3 |
| **Depends on** | F06 (activity service/composer), F07 `stageService.transition` (for auto-COLD; same wave, so code against the interface and stub it until F07 merges), F09 `recomputeFreshScores()` (F08 schedules it in `server/jobs/**`) |
| **Blocks** | F16 (overdue KPI) |
| **Personas** | REP, MANAGER |
| **Challenge req.** | — (extends R3) |
| **Owns (files/areas)** | `apps/web/server/services/followup.ts`, `apps/web/server/jobs/**`, `apps/web/components/followups/**`, `apps/web/app/api/leads/[id]/follow-ups/route.ts`, `apps/web/app/api/follow-ups/**`, `packages/shared/src/followup-rules.ts` (append-only) |

## 1. Summary
Reps schedule follow-ups on leads, see what's due today and what's overdue, and get cadence guidance ("Attempt 2 of 5"). Background jobs flag leads **at risk** after 3 days without activity and move them to **COLD** after 7 days or 3 unanswered attempts in a row, and they mark follow-ups **MISSED** 24 h after they're due. Together this keeps leads from silently dying.

## 2. User Stories & Acceptance Scenarios

### US-1 (P1): Schedule a follow-up
*As a rep, I want to schedule the next touch so I don't forget it.*

**Independent test:** Schedule a follow-up for tomorrow 18:00 and check that it appears in the lead's panel and in tomorrow's Due Today list.

1. **Given** I'm logging an activity (F06), **When** I set "Next follow-up" to tomorrow 18:00, **Then** a PENDING follow-up is created in the same transaction, assigned to the lead owner (or me if the lead is unassigned), and a `FOLLOW_UP_SCHEDULED` system activity appears.
2. **Given** a lead detail page, **When** I use the Follow-up panel's "Schedule" button (standalone, without an activity), with quick picks (in 2 h, Tomorrow 10:00, Tomorrow 18:00, In 3 days, custom), **Then** it's created likewise.
3. **Given** the due time is in the past, **Then** validation fails: "Pick a future time".

### US-2 (P1): Today's Follow-ups widget
*As a rep, I want one list of what's due today, with overdue items on top.*

1. **Given** I have 2 overdue and 4 due-today follow-ups, **When** I open `/inbox`, **Then** the "Due today" chip shows 6 and "Overdue" shows 2. The widget lists overdue items in red first, then today's items sorted by time, each with the lead name, priority dot, preferred channel icon and due time ("18:00" or "2 h overdue").
2. **When** I click an item, **Then** the lead detail opens with the composer focused.

### US-3 (P1): Complete a follow-up
1. **Given** a lead with a PENDING follow-up, **When** I log a USER activity with "Complete follow-up" checked (it defaults to checked when a pending follow-up is due within ±24 h or is overdue), **Then** the follow-up becomes DONE with `completed_at` and `completed_by_activity_id`.
2. **Given** the panel, **When** I click "Mark done" without logging, **Then** it becomes DONE, and a NOTE system entry "Follow-up marked done without activity" is recorded (for traceability).
3. Reschedule: "Snooze" moves `due_at` (+1 h / tomorrow / custom). This records `metadata.rescheduledFrom` in a system activity.
4. Cancel: the follow-up becomes CANCELLED with an optional note.

### US-4 (P1): Missed follow-ups
1. **Given** a PENDING follow-up 24 h past due, **When** the sweeper job runs, **Then** it becomes MISSED and a `FOLLOW_UP_MISSED` system activity is added. Managers see it in the team "overdue" metrics.
2. **Given** a follow-up due in the next 5 minutes, **When** the sweeper runs, **Then** `followup.due` is emitted to the owner (toast via F12), once per follow-up.

### US-5 (P1): At-risk and auto-COLD
*As a manager, I want neglected leads flagged automatically.*

**Independent test:** Seed a lead with `last_contact_at` 8 days ago (and a NOTE yesterday, which must not prevent it) in QUALIFIED, run the detector, and check that the stage is COLD and there's an `AUTO_COLD` activity.

1. **Given** an open lead (NEW…NEGOTIATION) with no **contact activity** (USER, type ≠ NOTE; measured from `coalesce(last_contact_at, created_at)`) for ≥ **3 days** (`AT_RISK_DAYS`), **Then** it shows an amber **"At risk"** badge in the inbox and detail. This is derived, not stored.
2. **Given** an open lead with no contact activity for ≥ **7 days** (`COLD_AFTER_DAYS`) **or** `attempt_count ≥ 3` (`COLD_AFTER_UNANSWERED`), **When** the cold-detector runs, **Then** it transitions to COLD (`changed_by = null`, reason "No activity 7 days" / "3 unanswered attempts"), with a `AUTO_COLD` activity and a `lead.updated` event.
3. **Given** a lead with a PENDING follow-up in the future, **Then** it's **not** auto-COLDed on the 7-day rule (the rep has a plan), but it still is on the unanswered rule.
4. A NEW lead's "age without activity" counts from `created_at`.

### US-6 (P2): Cadence guidance
1. **Given** a lead with 1 prior outreach attempt, **Then** the detail shows "Attempt 2 of 5 · Suggested: WhatsApp today" based on the cadence **Day 0 Call → Day 1 WhatsApp/SMS → Day 3 Call → Day 7 Email → Day 14 final message**, with the channel replaced by the customer's preferred channel when the cadence step is a generic message.
2. When a "Callback requested" outcome is logged, the composer suggests a follow-up at the customer's `best_time` the next day.

## 3. Functional Requirements
- **FR-001**: CRUD for follow-ups: create (with activity or standalone), complete, snooze/reschedule, cancel. Creation requires `due_at > now` and `≤ now + 90 days`.
- **FR-002**: Each lead has at most **one PENDING follow-up per assignee**. Creating a new one supersedes the old (CANCELLED with note "Superseded").
- **FR-003**: The follow-up assignee defaults to the lead owner. Reassigning a lead (F11) MUST move PENDING follow-ups to the new owner.
- **FR-004**: Overdue is derived: `status=PENDING AND due_at < now`.
- **FR-005**: Sweeper job every 60 s: PENDING with `due_at < now − 24h` → MISSED plus `FOLLOW_UP_MISSED` activity. Emit `followup.due` for `now ≤ due_at < now+5min`, deduplicated via Redis key `fu:notified:<id>` (TTL 1 h), with an in-memory Set fallback.
- **FR-006**: Cold detector every 60 s: apply the rules in FR-007 with a batch limit of 200 leads per run, each transition in its own transaction.
- **FR-007**: The rules live as constants in `packages/shared/src/followup-rules.ts`: `AT_RISK_DAYS=3`, `COLD_AFTER_DAYS=7`, `COLD_AFTER_UNANSWERED=3`, `MISSED_AFTER_HOURS=24`, `DUE_SOON_MINUTES=5`, `CADENCE=[{day:0,channel:'CALL'},{day:1,channel:'PREFERRED'},{day:3,channel:'CALL'},{day:7,channel:'EMAIL'},{day:14,channel:'PREFERRED'}]`. `'PREFERRED'` is a cadence-only token (not a `Channel` enum value) that resolves at display time to the customer's `preferred_channel`, falling back to `WHATSAPP` if the preferred channel is `CALL`. They can be overridden by env for the demo via `AT_RISK_DAYS`, `COLD_AFTER_DAYS`, `COLD_AFTER_UNANSWERED` and `MISSED_AFTER_HOURS` (fractional values allowed, e.g. `COLD_AFTER_DAYS=0.01`; listed in 04-architecture §7).
- **FR-008**: `attempt_count` follows F06 FR-003 step 3 (the single source of truth, implemented in F06's activity service; F08 only reads it): +1 on contact activities with outcome `NO_ANSWER` or `VOICEMAIL`; reset to 0 on `CONNECTED`, `INTERESTED`, `NOT_INTERESTED`, `CALLBACK_REQUESTED` or a `MEETING`/`TEST_DRIVE`; a `NOTE` leaves it unchanged.
- **FR-009**: Jobs start once per process from `instrumentation.ts` behind a global guard, can be disabled with `JOBS_ENABLED=false` (tests), and log each run's counts.
- **FR-012**: F08 MUST also schedule F09's `recomputeFreshScores()` every 5 minutes (`server/jobs/score-freshness.ts`), under the same guard, Redis job lock and `JOBS_ENABLED` switch. F09 owns the function and F08 owns the scheduling.
- **FR-010**: Authorization: follow-up actions require `lead:write` on the parent lead.
- **FR-011**: `GET /api/follow-ups?view=today|overdue|upcoming` returns the current user's follow-ups (managers can add `owner=<id>` within scope).

## 4. Key Entities & Data
`follow_ups` (all columns), `leads` (last_contact_at, created_at, attempt_count, stage, owner_id), `activities` (FOLLOW_UP_SCHEDULED, FOLLOW_UP_MISSED, AUTO_COLD), `customers.best_time`, `customers.preferred_channel`.

## 5. Edge Cases & Error Handling
- The lead is closed (WON/LOST): F07 cancels its follow-ups, and the sweeper ignores non-PENDING items.
- The lead is unassigned: follow-ups are assigned to the creator. When the lead is later claimed, they move to the new owner.
- DST changes (Europe/Berlin, Europe/Paris…): store UTC ms and render in the browser's timezone. Quick picks are computed client-side in local time.
- Several web processes: the jobs could run twice. Use a Redis lock `lock:job:<name>` (SET NX PX 55000). Without Redis it runs anyway (single instance assumed).
- A clock skew between client and server for "future time": the server allows 60 s of tolerance.
- Auto-COLD while a rep is on the page: F12 pushes `lead.updated`, and the page shows a banner "Lead moved to Cold".

## 6. Success Criteria
- **SC-001**: 100% of seeded leads meeting the cold criteria are COLD within 2 job cycles of startup.
- **SC-002**: The Due Today widget matches a direct DB query (test).
- **SC-003**: A follow-up due in 5 minutes produces exactly one toast for its owner.
- **SC-004**: Scheduling a follow-up takes ≤ 2 clicks from the composer (a quick pick).

## 7. UX Notes
- Inbox stat chips: "Due today 6 · Overdue 2 · At risk 5". Clicking one filters the inbox (F04 view params `due_today`, `overdue`, `going_cold`).
- The lead detail right column has a "Next follow-up" card showing the due time, the assignee avatar, and the buttons Done / Snooze / Cancel, with the cadence line underneath.
- Overdue is red text plus a clock icon ("2 h overdue"). At risk is an amber badge with the text "At risk · 4 d idle".
- The COLD stage chip is sky-grey with the tooltip "Auto-moved: no activity for 7 days".

## 8. Decisions
| # | Decision | Alternatives | Rationale |
|---|---|---|---|
| 1 | At-risk is derived at read time; COLD is persisted by a job | Everything computed at read time; everything by a job | Stage must be persisted for funnel history. At-risk is cheap to derive |
| 2 | `setInterval` jobs plus a Redis lock | BullMQ, cron | No extra infrastructure for the demo. BullMQ is the documented scale path |
| 3 | One PENDING follow-up per assignee per lead | Many | Keeps "the next step" unambiguous |
| 4 | Rules as shared constants, overridable by env | DB settings table | Fast to build. The demo can shorten the timers |
| 5 | A future follow-up protects from time-based COLD | Ignore follow-ups | Respects a deliberate plan ("customer back from holiday in 10 days") |

## 9. Technical Plan Input
**Endpoints**
```json
// POST /api/leads/:id/follow-ups
{ "dueAt": 1790050000000, "note": "Send finance quote" }
// 201 { "followUp": { "id": "..", "leadId": "..", "assignedTo": "..", "dueAt": 1790050000000, "status": "PENDING" } }

// PATCH /api/follow-ups/:id
{ "action": "complete" } | { "action": "snooze", "dueAt": 1790060000000 } | { "action": "cancel", "note": "Customer on holiday" }
// 200 { "followUp": { ... } }

// GET /api/follow-ups?view=today
// 200 { "items": [ { "id":"..","dueAt":..,"overdue":true,"lead":{ "id":"..","name":"Giulia Conti","priority":"HOT","preferredChannel":"WHATSAPP" } } ],
//       "counts": { "dueToday": 6, "overdue": 2 } }
```
Composer integration (F06 `CreateActivitySchema`, already in the shared schema): `nextFollowUp?: { dueAt: ISO string, note?: string }`, `completeFollowUpId?: string`.

**Services:** `followupService.{create, complete, snooze, cancel, listForUser, reassignPending(leadId, toUserId)}`, `coldRules.{isAtRisk(lead, now), shouldAutoCold(lead, hasFutureFollowUp, now)}` (pure), `cadence.next(lead, activities, customer)` (pure).
**Jobs:** `server/jobs/{index.ts, followup-sweeper.ts, cold-detector.ts, score-freshness.ts}` (the last one calls F09 `recomputeFreshScores()` every 5 min).
**Events:** `followup.due`, `lead.updated`, `activity.created`.
**Tests:** unit tests for `isAtRisk`/`shouldAutoCold`/`cadence.next` with a fixed `now`, service tests for supersede/reassign, a job test using an in-memory DB and fake timers, a Playwright test: schedule a follow-up, then check that it shows under Due Today.

## 10. Out of Scope
- Email or push notifications outside the app.
- Calendar sync (Google/Outlook).
- Per-team configurable cadences.

## 11. Open Questions
- Should managers get a daily digest of MISSED follow-ups? Proposed: P2, shown in the dashboard only.
- Should a MISSED follow-up reduce the lead score? Proposed: no, `attempt_count` already covers it.

## 12. Spec Kit Prompts
**`/speckit.specify`**
> Salespeople schedule the next follow-up on a lead, either while logging an activity or on its own, using quick choices like "tomorrow evening". They see a single list of follow-ups due today with overdue ones first, and can mark them done, snooze or cancel them. Follow-ups more than a day overdue are marked missed. Salespeople get a reminder shortly before a follow-up is due. Leads with no contact for 3 days are flagged "at risk". Leads with no contact for 7 days (unless a future follow-up is planned) or 3 unanswered attempts in a row are automatically moved to Cold, with the reason recorded in the timeline. Each lead shows cadence guidance such as "Attempt 2 of 5, suggested: WhatsApp today", following a standard 5-step, 14-day outreach cadence that adapts to the customer's preferred channel. Thresholds are configurable.

**`/speckit.plan`**
> Drizzle/SQLite `follow_ups` table (from F01). REST route handlers for create, patch actions and list views, Zod-validated and authorized via F03 `lead:write`. Pure rule functions in `packages/shared/src/followup-rules.ts`. Background jobs via setInterval started from Next.js `instrumentation.ts` with a global guard, a Redis `SET NX PX` lock per job, and Redis dedupe keys for due-soon notifications (in-memory fallback). Auto-COLD uses F07 `stageService.transition` with `changedBy=null`. Emit events on the Redis bus for F12 toasts. Vitest with fake timers, plus a Playwright check for the Due Today widget.
