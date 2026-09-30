# F06 — Activity Logging

| Field | Value |
|---|---|
| **ID** | F06 |
| **Priority** | P0 |
| **Build wave** | 2 |
| **Depends on** | F02 (current user), F03 (policy), F09 (`scoreLead`), F05 (composer slot and timeline cache keys; can be built in parallel against the documented contract) |
| **Blocks** | F07, F08, F14 (prefill), F18 (AI-assisted prefill) |
| **Personas** | REP (primary), MANAGER, VP |
| **Challenge req.** | **R3**: an interface for a salesperson to log a new follow-up activity for a lead, which must be persisted |
| **Owns (files/areas)** | `apps/web/components/leads/composer/**`, `apps/web/app/api/leads/[id]/activities/handlers/post.ts` (replaces the F01 501 stub; `route.ts` itself is an F01 delegating scaffold), `apps/web/server/services/activity.ts`, `packages/shared/src/schemas/activity.ts` (append-only); registers the composer in F05's `slots.tsx` (append-only) |

## 1. Summary
A composer pinned at the top of the lead timeline lets a salesperson record what they just did ("Called customer, no answer") in seconds, optionally scheduling the next follow-up and moving the stage. One submit is **one atomic transaction**. It writes the activity, keeps lead bookkeeping correct (stage auto-advance, first response, last activity, attempt counter, score), writes system events and an audit entry, and then broadcasts an event. Activities are **append-only**. The entry appears instantly (optimistic) and is still there after a reload or a server restart.

## 2. User Stories & Acceptance Scenarios

### US-1 (P1): Log a follow-up activity · R3
*As a rep, I want to record a call, message or note on a lead so my team and I have an accurate history.*

**Independent test:** on a lead you own, submit type Call, outcome Connected, note "Called customer". The entry appears at the top of the timeline. Reload the page, then restart the server: the entry is still there. The `activities` table has the row.

1. **Given** I own lead L, **When** I choose type **Call**, outcome **Connected**, type "Called customer, interested in test drive", and press **Log activity** (or Ctrl/⌘+Enter), **Then** the entry appears at the top of the timeline immediately, marked "Saving…", and within 1 s is confirmed with the server timestamp. *(R3)*
2. **Given** the entry was saved, **When** I reload the page, **Then** it's still in the timeline with the same text, type, outcome, author and time. *(R3: persisted)*
3. **Given** the entry was saved, **When** the server process restarts and I reopen the lead, **Then** the entry is still present (SQLite on disk, WAL). *(R3: persisted)*
4. **Given** I return to the inbox, **Then** L's "Last activity" shows "Call · just now". *(R3 → R1)*

### US-2 (P1): Validation that helps
1. **Given** the note is empty or only whitespace, **When** I submit, **Then** the submit button is disabled, and the server also rejects it with 400 `VALIDATION_ERROR` (`note` required, 1–2000 chars after trim). *(R3)*
2. **Given** type Call/WhatsApp/SMS/Email, **Then** the outcome is required. **Given** type Note, **Then** the outcome is hidden and not accepted. **Given** Meeting or Test drive, **Then** the outcome is optional. *(R3)*
3. **Given** a note longer than 2000 characters, **Then** the counter turns red and submit is disabled.

### US-3 (P1): Automatic lead bookkeeping
1. **Given** L is in stage NEW with no contact activity, **When** I log a **contact activity** (any type except Note) without choosing a stage, **Then** L moves to **CONTACTED**, and the timeline shows the system entry "Stage changed NEW → CONTACTED · auto: first activity". `first_response_at` is set.
1a. **Given** L is NEW, **When** I log a **Note**, **Then** the note is saved but L stays NEW, `first_response_at` stays null, `attempt_count` is unchanged, and the lead still counts as uncovered (an internal note isn't customer contact).
2. **Given** L is COLD, **When** I log a Call/WhatsApp/SMS/Email/Meeting/Test drive, **Then** L is revived to **CONTACTED** (system entry "Revived from COLD").
3. **Given** L has `attempt_count = 1`, **When** I log a Call with outcome **No answer**, **Then** `attempt_count` becomes 2. **When** I later log outcome **Connected**, **Then** it resets to 0.
4. **Given** L has score 64 (WARM), **When** I log an outcome **Interested**, **Then** the score is recomputed via F09 (engagement +15), the header shows the new score, and if the band changed (WARM → HOT) a system entry "Priority WARM → HOT" is added.

### US-4 (P1): Schedule the next follow-up while logging
1. **Given** I tick **Schedule follow-up** and choose "Tomorrow 10:00", **When** I submit, **Then** a PENDING follow-up is created for the lead owner (or me if unassigned by an eligible role), and the timeline shows "Follow-up scheduled for Thu 1 Oct, 10:00".
2. **Given** a follow-up time in the past, or more than 90 days ahead, **Then** validation rejects it.
3. **Given** L has a pending follow-up due today, **When** I log an activity, **Then** the composer shows a pre-ticked checkbox "Mark follow-up 'Call back about finance' as done". Submitting marks it DONE and links it to this activity.

### US-5 (P2): Change stage while logging
1. **Given** L is CONTACTED, **When** I pick "Move to QUALIFIED" and submit, **Then** the stage changes in the same transaction, with a `stage_history` row and a system entry.
2. **Given** L is CONTACTED, **Then** the stage options list only offers allowed open-stage targets (QUALIFIED, plus backward moves). Skipping ahead (e.g. CONTACTED → NEGOTIATION) isn't offered, and the server returns 422 `INVALID_TRANSITION` if it's forced.
3. **Given** I need WON or LOST, **Then** the composer shows a link "Close lead…", which opens the F07 flow. F06 doesn't accept WON or LOST.
4. **Given** someone else changed L's stage after I opened the page, **When** I submit a stage change, **Then** I get 409 `STALE_LEAD` with "This lead was updated by Marco Bianchi. Review and retry." The activity isn't saved (all or nothing), and my typed note is kept.

### US-6 (P1): Permissions
1. **Given** I'm a rep viewing an unassigned lead in my team pool, **Then** the composer is replaced by "Claim this lead to log activities" (F11), and a forced POST returns 403 `FORBIDDEN`.
2. **Given** I'm Lukas (manager, DACH), **When** I log on a lead owned by Anna Weber, **Then** it's allowed, and the entry's actor is Lukas.
3. **Given** Sofia posts to a DACH lead id, **Then** 404 `NOT_FOUND` (no existence leak, per F05).

### US-7 (P2): Fast, safe input
1. **Given** a flaky network, **When** a request fails, **Then** the optimistic entry is removed, a toast says "Couldn't save activity. Your note is kept", and the form still holds my input.
2. **Given** I double-click submit, **Then** only one activity is created (the button disables while pending, and `clientRequestId` makes the request idempotent).
3. **Given** F14 or F18 prefills the composer (type WhatsApp, drafted note, `aiAssisted: true`), **Then** the fields are filled and focus moves to the outcome/note, and the saved entry carries the AI-assisted flag.

## 3. Functional Requirements
- **FR-001**: The system MUST provide a composer with **type** (`CALL`, `WHATSAPP`, `SMS`, `EMAIL`, `MEETING`, `TEST_DRIVE`, `NOTE`), **outcome** (`CONNECTED`, `NO_ANSWER`, `VOICEMAIL`, `INTERESTED`, `NOT_INTERESTED`, `CALLBACK_REQUESTED`), **note** (required, 1–2000 chars trimmed), optional **next follow-up** (datetime + optional note ≤ 200), optional **complete pending follow-up**, and optional **stage change** (open stages only).
- **FR-002**: Outcome rules: required for contact types (`CALL`, `WHATSAPP`, `SMS`, `EMAIL`), optional for `MEETING` and `TEST_DRIVE`, forbidden for `NOTE`.
- **FR-003**: `POST /api/leads/:id/activities` MUST perform these steps in **one DB transaction**; any failure rolls back everything:
  1. load the lead and `authorize(user, 'activity:create', lead)` (not readable → 404; readable but not permitted → 403);
  2. insert the USER activity (`kind=USER`, `actor_id=user`, `ai_assisted`, `metadata.clientRequestId`);
  3. update `attempt_count`: contact type with `NO_ANSWER`/`VOICEMAIL` → +1; any outcome in {`CONNECTED`,`INTERESTED`,`NOT_INTERESTED`,`CALLBACK_REQUESTED`}, or type `MEETING`/`TEST_DRIVE` → 0; `NOTE` → unchanged;
  4. if the activity is a **contact activity** (`isContactActivity`: USER and type ≠ NOTE), set `first_response_at` if null and set `last_contact_at = now`; always set `last_activity_at = now`;
  5. auto-advance via `autoAdvance()` from `packages/shared/src/stage-machine.ts`: NEW → CONTACTED on the first contact activity; COLD → CONTACTED on a contact activity; a NOTE never advances. Each writes `stage_history` (changed_by = user, reason `auto:first_activity` / `auto:revive`) plus a SYSTEM `STAGE_CHANGED` activity;
  6. apply an explicit stage change (after auto-advance) if it's a valid open→open transition per the shared state machine; otherwise 422 `INVALID_TRANSITION`. If the request includes `expectedVersion` and it doesn't match `leads.version`, return 409 `STALE_LEAD`;
  7. create the follow-up if requested (`assigned_to = lead.owner_id ?? user.id`, status PENDING) plus a SYSTEM `FOLLOW_UP_SCHEDULED` activity;
  8. complete the pending follow-up if `completeFollowUpId` is given (it must belong to this lead and be PENDING/overdue): status DONE, `completed_at`, `completed_by_activity_id`;
  9. recompute the score with F09 `scoreLead(leadSnapshot)` → update `score`, `priority`, `score_breakdown`; if the priority band changed, add a SYSTEM `SCORE_CHANGED` activity `{fromPriority,toPriority,fromScore,toScore}`;
  10. increment `leads.version`, set `updated_at`;
  11. insert an `audit_log` row (`action='activity.create'`, entity `lead`, before/after of the changed lead fields).
- **FR-004**: After commit, the system MUST publish `activity.created` (once per inserted activity, USER and SYSTEM, in order) and one `lead.updated` with the changed fields, via the F01 event bus. Publish failures are logged and MUST NOT fail the request.
- **FR-005**: The endpoint MUST be idempotent on `clientRequestId` (ULID generated by the client): a repeat with the same id for the same lead within 10 minutes returns the original 201 payload without creating new rows.
- **FR-006**: Activities MUST be append-only. No PUT/PATCH/DELETE endpoints exist. Corrections are logged as a new `NOTE`.
- **FR-007**: The client MUST insert an optimistic entry into `['lead', id, 'activities', …]` caches, roll back on error while keeping form values, and on success replace it with the server rows, update `['lead', id]` with the returned lead fields, and invalidate `['leads']`.
- **FR-008**: The composer MUST expose `useComposer()` with `prefill({ type?, note?, outcome?, aiAssisted? })` and `focus()` for F14 and F18.
- **FR-009**: The note MUST be stored exactly as typed (after trim) and rendered as plain text (F05 FR-008).
- **FR-010**: The follow-up `dueAt` MUST be in the future (≥ now + 1 min) and ≤ now + 90 days. Quick picks: "In 2 h", "Tomorrow 10:00", "In 3 days", "Next Monday 10:00", "Custom".
- **FR-011**: Keyboard: `1`–`7` pick the type when the composer is focused but not typing in the note; Ctrl/⌘+Enter submits; Esc clears (with a confirm if the note is non-empty).
- **FR-012**: Server-side validation MUST use the same Zod schema as the client (`CreateActivitySchema` in `packages/shared`).

## 4. Key Entities & Data
- Writes: `activities`, `leads` (`stage`, `attempt_count`, `first_response_at`, `last_activity_at`, `score`, `priority`, `score_breakdown`, `version`, `updated_at`), `stage_history`, `follow_ups`, `audit_log`.
- Reads: the shared stage machine (`packages/shared/src/stage-machine.ts`, owned by F01, per 03-domain-model §3), `scoreLead` (F09), and customer/purchase facts needed for scoring (`customers.is_returning`, purchases).

## 5. Edge Cases & Error Handling
- The lead was reassigned away mid-edit: the POST returns 403 (still readable as a manager) or 404 (no longer in scope). The UI shows an explanation and keeps the note.
- The lead is WON or LOST: logging a NOTE is allowed (post-sale notes); contact types are allowed but don't change the stage. LOST → CONTACTED reopen is F07 (manager+) only.
- Concurrent submits by two users on the same lead with no stage change: both succeed (append-only), and the order is by server timestamp and ULID.
- Concurrent stage changes: the second gets 409 via `expectedVersion`.
- `completeFollowUpId` belongs to another lead or is already DONE: 422 `INVALID_FOLLOW_UP`.
- The event bus or Redis is down: the activity is still saved (FR-004). A warning is logged, and F12 clients refetch on reconnect.
- The score function throws (bug): the transaction rolls back and returns 500, and nothing partial is written. Covered by a unit test on `scoreLead` totality.
- Unicode, emoji and newlines in the note: stored and rendered correctly. Control characters other than `\n` and `\t` are stripped server-side.
- Clock skew: the server sets all timestamps; client times are ignored except `dueAt`.

## 6. Success Criteria
- **SC-001**: A rep logs an activity in ≤ 3 clicks plus typing from the lead page (type → outcome → submit), and in ≤ 4 from the inbox.
- **SC-002**: The optimistic entry is visible in < 100 ms. Server confirmation p95 < 150 ms locally.
- **SC-003**: 100% of acknowledged activities (201) are present after a reload and after a server restart (automated e2e plus integration test).
- **SC-004**: Zero partial writes: fault-injection tests (throw at each transaction step) leave the DB unchanged.
- **SC-005**: Double-submit and retry produce exactly one activity (idempotency test).

## 7. UX Notes
```
┌──────────────────────────────────────────────────────────────┐
│ [☎ Call][💬 WhatsApp][✉ SMS][@ Email][👥 Meeting][🚗 Test drive][📝 Note] │
│ Outcome: [Connected ▾]                                        │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ What happened? e.g. "Called customer, wants test drive…" │ │
│ └──────────────────────────────────────────────────────────┘ │
│ ☐ Schedule follow-up [Tomorrow 10:00 ▾]   Stage: [Keep QUALIFIED ▾] │
│ ☑ Mark follow-up "Call back about finance" as done   0/2000   │
│                                            [Log activity ⌘↵] │
└──────────────────────────────────────────────────────────────┘
```
- The composer is collapsed to a single "Log an activity…" input until focused, which saves vertical space for the timeline.
- The type buttons are a segmented control with icons and labels (accessible as a radiogroup). The default type is the customer's preferred channel when F14 exists; otherwise Call.
- After success, the form resets (keeping the type), there's a brief green check on the button, and focus returns to the note input for rapid logging.
- Error toast plus inline field errors. The form is never cleared on error.
- "Close lead…" link (to F07) is shown next to the stage select.

## 8. Decisions
| # | Decision | Alternatives | Rationale |
|---|---|---|---|
| 1 | One endpoint, one transaction for activity plus side effects | Separate calls for stage and follow-up | Atomic, consistent timeline. One user gesture = one commit |
| 2 | Append-only activities | Editable/deletable notes | Traceability and trust (D14). Corrections as new notes |
| 3 | Auto NEW → CONTACTED on the first **contact** activity; COLD revive; NOTE excluded | Manual stage changes only; any USER activity counts | Keeps coverage and FRT metrics honest without extra clicks. Internal notes aren't customer contact |
| 4 | Score recomputed synchronously in the transaction | Async job | The header and inbox are immediately correct. `scoreLead` is pure and cheap |
| 5 | Optimistic UI with rollback | Wait for the server | Feels instant (SC-002). Safe because the server is authoritative |
| 6 | Idempotency via `clientRequestId` | None / Redis-only keys | Prevents duplicates from double-clicks and retries. Checked in SQLite (`json_extract(metadata,'$.clientRequestId')`), so it works without Redis |
| 7 | WON/LOST excluded from F06 | Handle every stage here | Closing needs deal value, lost reason and offer; that belongs to F07's dedicated flow |
| 8 | Optimistic concurrency only when a stage change is included | Always require a version | Appending a note never conflicts; stage changes can |
| 9 | F06 writes follow-up rows directly (minimal) | Wait for F08 | Keeps R3 plus scheduling demoable in wave 2. F08 extends it with a sweeper, list and UI |

## 9. Technical Plan Input (for `/speckit.plan`)

**`POST /api/leads/:id/activities`**, request body (`CreateActivitySchema`):
```json
{
  "clientRequestId": "01J9ZC…",
  "type": "CALL",
  "outcome": "NO_ANSWER",
  "note": "Called customer, no answer. Will try WhatsApp in the evening.",
  "aiAssisted": false,
  "nextFollowUp": { "dueAt": "2026-10-01T08:00:00.000Z", "note": "Try WhatsApp" },
  "completeFollowUpId": "01J9…",
  "stageChange": { "to": "QUALIFIED" },
  "expectedVersion": 7
}
```
**201**
```json
{
  "activity": { "id": "…", "kind": "USER", "type": "CALL", "outcome": "NO_ANSWER", "note": "…",
                "actor": { "id": "…", "name": "Sofia Rossi", "avatarColor": "#7c3aed" }, "aiAssisted": false,
                "metadata": { "clientRequestId": "01J9ZC…" }, "createdAt": 0 },
  "systemActivities": [{ "id": "…", "kind": "SYSTEM", "type": "STAGE_CHANGED", "metadata": { "from": "NEW", "to": "CONTACTED", "reason": "auto:first_activity" }, "createdAt": 0 },
                       { "id": "…", "kind": "SYSTEM", "type": "FOLLOW_UP_SCHEDULED", "metadata": { "followUpId": "…", "dueAt": 0 }, "createdAt": 0 }],
  "lead": { "id": "…", "stage": "CONTACTED", "score": 58, "priority": "WARM", "scoreBreakdown": {}, "attemptCount": 1,
            "firstResponseAt": 0, "lastActivityAt": 0, "version": 8 },
  "followUp": { "id": "…", "dueAt": 0, "status": "PENDING", "assignedTo": "…" }
}
```
Errors: 400 `VALIDATION_ERROR` (with `fields`), 401 `UNAUTHENTICATED`, 403 `FORBIDDEN`, 404 `NOT_FOUND`, 409 `STALE_LEAD` (`{ currentVersion, updatedBy }`), 422 `INVALID_TRANSITION` / `INVALID_FOLLOW_UP`. An idempotent replay returns 201 with the original payload.

**Service** `server/services/activity.ts`
- `logActivity(user, leadId, input): Promise<LogActivityResult>`: synchronous better-sqlite3 transaction (`db.transaction(() => …)`) implementing FR-003 steps 1–11. It returns the inserted rows and the lead delta, then calls `bus.publish(...)` after commit.
- Helpers: `nextAttemptCount(prev, type, outcome)` (in `activity.ts`), plus `autoAdvance(stage, type, kind)`, `isContactActivity(type, kind)` and `canTransition(from, to, role)` from `packages/shared/src/stage-machine.ts` (F01). These are pure and unit-tested. F07 later adds `server/services/stage.ts#transition` (history, events, WON/LOST), and F06 calls it for explicit stage changes.
- Uses F09 `scoreLead(input)` with `{ ...leadFacts, isReturning, hasRecentPurchase, lastOutcome, attemptCount, now }`.
- Uses the F01 audit writer `writeAudit(tx, {...})`.

**Route** `app/api/leads/[id]/activities/handlers/post.ts` (F01's `route.ts` delegates its `POST` export here; F06 replaces the 501 stub body). The handler checks the `Origin` header (F02 CSRF rule), parses JSON (≤ 16 KB), validates with Zod, and maps domain errors to HTTP codes.

**Components** `components/leads/composer/`: `ActivityComposer` (registered in F05 `leadSlots.composer`), `TypeSegmentedControl`, `OutcomeSelect`, `FollowUpPicker`, `StageSelect`, `CompleteFollowUpCheckbox`, `useLogActivity` (TanStack `useMutation` with `onMutate`/`onError`/`onSuccess` per FR-007), `useComposer` (zustand or React context store for prefill).

**Events** (payloads per `03-domain-model §5`): `activity.created` × N, then `lead.updated { leadId, changed: { stage?, score?, priority?, lastActivityAt, attemptCount } }`.

**Tests**
- Unit: `nextAttemptCount` truth table; `autoAdvance` for every stage × type (NOTE never advances); the Zod schema (outcome rules, note bounds, dueAt window); `isAllowedOpenTransition`.
- Integration (real SQLite temp file): the happy path writes the expected rows in every table; NEW → CONTACTED auto; COLD revive; score/priority change adds SCORE_CHANGED; idempotent replay; 409 on a stale version; 403 for a rep on a pool lead; 404 out of scope; **fault injection** at each step leaves 0 new rows; publish failure still returns 201.
- Persistence: insert via the API, close the DB connection, reopen, and assert the row exists (simulated restart).
- E2E `tests/e2e/core-loop.spec.ts` (shared with F04/F05): login as Sofia → inbox → open the first lead → log Call/Connected "Called customer" → appears at the top → **reload** → still present → inbox row shows "Call · just now". A second test: empty note → submit disabled.

## 10. Out of Scope
- WON/LOST closing, lost reasons, deal value, reopen (F07).
- Follow-up list, overdue sweeper, MISSED status, reminders (F08).
- Channel deep links and templates (F14). The AI drafting itself (F18). F06 only accepts prefills.
- Editing or deleting activities, and attachments or files.
- Mentions or notifications to teammates.

## 11. Open Questions
- Resolved: a `NOTE` is not customer contact. It doesn't trigger auto NEW→CONTACTED, doesn't set `first_response_at`, doesn't count toward coverage, and doesn't change `attempt_count` ("contact activity" = USER, type ≠ NOTE; 03-domain-model §3/§6).
- Should logging on an unassigned pool lead by a manager auto-assign it to that manager? Currently no; the follow-up is assigned to the actor.

## 12. Spec Kit Prompts
**`/speckit.specify`**
> Let salespeople log follow-up activities on a sales lead. On the lead page there is a compact form at the top of the timeline where they choose what they did (call, WhatsApp, SMS, email, meeting, test drive or internal note), the outcome (connected, no answer, voicemail, interested, not interested, callback requested; required for contact attempts, not used for notes), and write a short note describing what happened. They can optionally schedule the next follow-up (quick choices like "tomorrow 10:00", within the next 90 days), mark a pending follow-up as done, and move the lead to another open pipeline stage. Saving must feel instant: the entry appears at the top of the timeline immediately, and if saving fails it disappears with an explanation while the typed text is kept. Saved activities are permanent: they survive page reloads and server restarts, and can never be edited or deleted (corrections are new notes). Saving an activity also keeps the lead up to date automatically: a brand-new lead becomes "contacted" on its first actual customer contact (an internal note doesn't count), a cold lead is revived, unanswered attempts are counted and reset when the customer is reached, the time of first response and last activity is recorded, and the lead's score and priority are refreshed. Everything from one save happens together or not at all. Double-clicking must not create duplicates. Reps can only log on leads they own; managers on their team's leads; the VP on any lead. If someone else changed the lead's stage in the meantime, the salesperson is told and nothing is lost.

**`/speckit.plan`**
> Next.js route handler `POST /api/leads/:id/activities`: implement `apps/web/app/api/leads/[id]/activities/handlers/post.ts` (F01's `route.ts` delegates to it; don't edit `route.ts`). Zod `CreateActivitySchema` in `packages/shared/src/schemas/activity.ts`, shared by client and server. Service `server/services/activity.ts#logActivity` runs one synchronous better-sqlite3/Drizzle transaction: authorize via F03 (404 unreadable / 403 not permitted) → insert USER activity → attempt_count rules → first_response_at/last_activity_at → auto-advance NEW→CONTACTED and COLD→CONTACTED on contact activities only (NOTE never advances or sets first response) with stage_history plus SYSTEM activities → optional open-stage transition validated by `packages/shared/src/stage-machine.ts`, with `expectedVersion` optimistic concurrency (409) → optional follow-up insert plus FOLLOW_UP_SCHEDULED → optional follow-up completion → F09 `scoreLead` recompute (SCORE_CHANGED on band change) → version++ → audit_log. After commit, publish `activity.created` and `lead.updated` on the F01 event bus (never fail the request). Idempotency via `clientRequestId` stored in activity metadata and checked with `json_extract`. Client: `ActivityComposer` registered in F05's `leadSlots.composer`, TanStack `useMutation` with optimistic insert/rollback, `useComposer().prefill()` for F14/F18, keyboard shortcuts, shadcn/ui controls. Tests: Vitest unit truth tables, integration tests on a temp SQLite file including fault injection, idempotency, 409/403/404 and simulated restart, plus the Playwright core-loop e2e (login → inbox → open lead → log activity → reload → still there).

## Build notes (as implemented)
- **Permission action**: the endpoint calls F03 `authorize(user, 'lead:write', lead, activityType)`, not a separate `activity:create`. F03 rules therefore apply: a rep acting on a lead they do not own gets 403 (pool lead) or 404 (another rep's lead, outside rep scope); WON/LOST leads accept only `NOTE` (contact types return 403, not "allowed without stage change").
- **Error codes**: 401 `UNAUTHENTICATED`, 403 `FORBIDDEN`, 404 `NOT_FOUND`, 409 `STALE_LEAD` (body adds `currentVersion`, `updatedBy`), 422 `INVALID_TRANSITION` / `INVALID_FOLLOW_UP`, 400 `VALIDATION_ERROR` with `fields`.
- **Follow-up completion** accepts `PENDING` and `MISSED` follow-ups (the schema has no OVERDUE status).
- **Idempotent replay** rebuilds the payload from stored rows; `lead` reflects the current lead state, not the state at the original save.
- **Explicit stage change equal to the stage after auto-advance** is a no-op (not an error).
- **Slots / cache**: `slots.tsx` and TanStack Query were not present on this branch. F06 ships a minimal `slots.tsx` (F05 contract shape) and the mutation hook talks to the cache through a small `ActivityCache` interface (`ActivityCacheProvider`) that F05's `QueryClient` satisfies, so no dependency was added.
- **E2E location**: Playwright `testDir` is `apps/web/e2e`, so the core-loop spec lives at `apps/web/e2e/core-loop.spec.ts`.

