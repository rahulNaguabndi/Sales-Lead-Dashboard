# F07 — Stage Pipeline, Won/Lost & Kanban

| Field | Value |
|---|---|
| **ID** | F07 |
| **Priority** | P1 |
| **Build wave** | 3 |
| **Depends on** | F05 (detail page slots), F06 (activity service, transaction helper) |
| **Blocks** | F16 (funnel, revenue, stage aging) |
| **Personas** | REP, MANAGER, VP |
| **Challenge req.** | — (enriches R2 timeline) |
| **Owns (files/areas)** | `apps/web/server/services/stage.ts`, `apps/web/app/(app)/pipeline/**`, `apps/web/components/leads/stage/**`, `apps/web/app/api/leads/[id]/stage/route.ts` (PATCH). Consumes `packages/shared/src/stage-machine.ts` (owned by F01; F07 may only append, e.g. helper exports) |

## 1. Summary
Leads move through a defined pipeline: NEW → CONTACTED → QUALIFIED → TEST_DRIVE → NEGOTIATION → WON/LOST, plus a dormant COLD stage. This feature enforces the state machine, captures the closing data (deal value in €, applied offer, lost reason), records every transition in `stage_history` and the timeline, and adds a Kanban board. Stage data drives the funnel, conversion, revenue and stage-aging metrics in F16.

## 2. User Stories & Acceptance Scenarios

### US-1 (P1): Change a lead's stage from the detail page
*As a rep, I want to move a lead to the next stage so that the pipeline reflects reality.*

**Independent test:** Open a CONTACTED lead, change its stage to QUALIFIED, reload, and check that the stage, the timeline entry and the stage_history row all exist.

1. **Given** a lead in CONTACTED that I own, **When** I pick QUALIFIED from the stage dropdown, **Then** the stage updates, a `STAGE_CHANGED` system activity "CONTACTED → QUALIFIED" appears at the top of the timeline, and a `stage_history` row is written.
2. **Given** a lead in NEW, **When** I open the stage dropdown, **Then** only valid targets are enabled (CONTACTED, LOST). Invalid ones (for example WON) are disabled with a tooltip "Not allowed from NEW".
3. **Given** the API receives an invalid transition (NEW → WON), **Then** it returns `422 INVALID_TRANSITION` and nothing changes.

### US-2 (P1): Close a lead as WON
*As a rep, I want to record a won deal with its value so that revenue is tracked.*

**Independent test:** Move a NEGOTIATION lead to WON with €36,500 and check that the dashboard revenue increases by €36,500.

1. **Given** a NEGOTIATION lead, **When** I choose WON, **Then** a dialog asks for the **deal value (€, required, > 0)**, the **vehicle model** (defaulting to the lead's model) and an **optional applied offer**, chosen from the offers currently matched (F15).
2. **When** I confirm, **Then** `stage=WON`, `deal_value` (cents), `applied_offer_id` and `closed_at` are saved, the open follow-ups are CANCELLED, and the timeline shows "Won · 36.500 € · Aurora SUV" plus `OFFER_APPLIED` if an offer was chosen.
3. **Given** I enter an empty or zero deal value, **Then** Confirm stays disabled and an inline error is shown.

### US-3 (P1): Close a lead as LOST with a reason
1. **Given** an open lead, **When** I choose LOST, **Then** a dialog requires a reason from `PRICE, BOUGHT_ELSEWHERE, NOT_READY, UNREACHABLE, FINANCING_DECLINED, OTHER`. OTHER requires a note of 3–500 chars.
2. **When** I confirm, **Then** `stage=LOST`, `lost_reason`, `lost_note` and `closed_at` are saved, the pending follow-ups are CANCELLED, and the timeline entry shows the reason.

### US-4 (P1): Reopen and revive
1. **Given** a COLD lead, **When** a rep logs a contact activity (USER, not a Note) or sets the stage to CONTACTED, **Then** the lead moves to CONTACTED ("Revived") and `attempt_count` resets to 0.
2. **Given** a LOST lead, **When** a MANAGER or VP chooses "Reopen", **Then** it moves to CONTACTED, `closed_at`, `lost_reason` and `lost_note` are cleared, and the timeline shows "Reopened by Lukas Becker". A REP doesn't see the option, and the API returns 403.
3. **Given** a WON lead, **Then** its stage cannot change (terminal). The API returns `422 INVALID_TRANSITION`.

### US-5 (P2): Concurrent edits are detected
1. **Given** two users have the same lead open at `version=4`, **When** user A changes the stage (version becomes 5) and then user B submits a stage change with `version=4`, **Then** B receives `409 VERSION_CONFLICT`, the UI shows "This lead was updated by Lukas Becker. Refreshed.", and the lead is refetched.

### US-6 (P2): Kanban pipeline board
*As a rep or manager, I want to see my leads by stage and drag them between columns.*

**Independent test:** Drag a card from QUALIFIED to TEST_DRIVE, reload, and check that it stayed.

1. **Given** `/pipeline`, **Then** there are columns for NEW, CONTACTED, QUALIFIED, TEST_DRIVE, NEGOTIATION, WON (last 30 days), LOST (last 30 days) and COLD. Each column shows a count and its **pipeline value** (sum of budget_max in €).
2. Cards show the name, model, priority dot, score, owner avatar and days in stage.
3. **When** I drag a card to a valid column, **Then** the same PATCH is called, optimistically. Invalid drop targets are dimmed while dragging. Dropping on WON or LOST opens the matching dialog, and cancelling it snaps the card back.
4. The board is scoped like the inbox, with the same filters (owner for managers, source, priority).
5. Keyboard alternative: focus a card, press `M` to get a "Move to…" menu.

## 3. Functional Requirements
- **FR-001**: The system MUST validate every stage change against the transition table in `packages/shared/src/stage-machine.ts` (docs/03 §3), server-side.
- **FR-002**: Allowed transitions: forward per the diagram; **backward between open stages** (any open → any earlier open stage); any open → LOST; any open → COLD (system only, or manager+ manually); COLD → CONTACTED; LOST → CONTACTED (MANAGER/VP only); WON is terminal.
- **FR-003**: Each successful change MUST, in one transaction, update `leads.stage`, `updated_at`, `version+1`, insert `stage_history(from, to, changed_by, reason, changed_at)`, and insert a `STAGE_CHANGED` system activity with `metadata {from,to,reason?}`.
- **FR-004**: WON MUST require `dealValue` (integer cents > 0, ≤ 100,000,000 cents / €1M). `appliedOfferId` is optional and, if given, MUST be an offer currently matching this lead (F15 matcher). It sets `closed_at` and, in the same transaction, inserts a `purchases` row (`customer_id`, `lead_id`, `vehicle_model`, `amount = dealValue`) and sets `customers.is_returning = 1`.
- **FR-005**: LOST MUST require `lostReason`. `OTHER` requires `lostNote`. Sets `closed_at`.
- **FR-006**: Moving to WON or LOST MUST cancel the lead's PENDING follow-ups (status CANCELLED).
- **FR-007**: A stage PATCH MUST include `version`. A mismatch returns 409 with the current lead.
- **FR-008**: Authorization: `authorize(user, 'lead:changeStage', lead)` (own/team/org per F03). Reopening LOST requires `lead:reopen` (MANAGER, VP).
- **FR-009**: Publish `lead.updated {leadId, changed: {stage, dealValue?}}` and `activity.created` after commit.
- **FR-010**: Expose `stageService.transition(ctx, leadId, input)` for reuse by F06 (auto NEW→CONTACTED on the first contact activity, i.e. USER with type ≠ NOTE; COLD→CONTACTED revive) and F08 (auto-COLD, `changedBy=null`).
- **FR-011**: The score MUST be recomputed after a stage change (F09 `scoreLead`), and `SCORE_CHANGED` is emitted if the priority band changes.
- **FR-012**: The Kanban MUST load at most 200 cards per open column (sorted by score desc), with a "+N more → open in inbox" link.
- **FR-013**: WON/LOST dialog amounts are displayed and entered in EUR using the `de-DE` format ("36.500 €"), with input accepting both "36500" and "36.500".

## 4. Key Entities & Data
`leads` (stage, deal_value, applied_offer_id, lost_reason, lost_note, closed_at, version, attempt_count), `stage_history`, `activities` (STAGE_CHANGED, OFFER_APPLIED), `follow_ups` (cancel), `offers` (read for validation).

## 5. Edge Cases & Error Handling
- The same-stage "transition" is a no-op and returns 200 without writing history.
- The lead is reassigned while the WON dialog is open: the version check catches it (409).
- An applied offer expires between opening the dialog and confirming: the server re-validates and returns `422 OFFER_NOT_APPLICABLE`, and the dialog refreshes its offer list.
- An auto-COLD job runs while a rep is editing: the rep's submit gets 409, then refetches (COLD → the chosen stage may still be allowed).
- Drag and drop on a touch device: a long-press starts the drag. A tap opens the lead.
- A rep drags another rep's lead (visible to a manager only): the UI hides the board for out-of-scope leads, and the API still enforces 403.

## 6. Success Criteria
- **SC-001**: 100% of invalid transitions are rejected by the API (unit-tested for the full 8×8 matrix).
- **SC-002**: A stage change reflects in the timeline and Kanban in < 500 ms locally.
- **SC-003**: Every WON lead has a deal value, and every LOST lead has a reason (a DB check plus a service test).
- **SC-004**: Funnel counts in F16 equal the `stage_history`-derived counts for seed data.

## 7. UX Notes
- A stage chip in the lead header acts as a dropdown, with colors: NEW slate, CONTACTED blue, QUALIFIED indigo, TEST_DRIVE violet, NEGOTIATION amber, WON green, LOST red, COLD sky-grey. The chip always includes a text label.
- WON dialog: a big € input, a model select, an "Apply offer" radio list (the offer title plus its value), and a "Confirm win" primary button.
- LOST dialog: a reason radio list plus a note textarea (required for Other).
- Kanban: horizontal scroll, 280 px columns, sticky headers with count and €. The empty state reads "No leads in this stage".
- Toast after changes: "Moved to Qualified". Error toast on 409/422 with the reason.

## 8. Decisions
| # | Decision | Alternatives | Rationale |
|---|---|---|---|
| 1 | Transition table in the shared package, enforced on the server, mirrored in the UI | UI-only validation; free-form stages | A single source of truth and a testable matrix |
| 2 | Allow backward moves between open stages | Strict forward-only | Real sales go backward (for example a test drive falls through) |
| 3 | WON is terminal. LOST can be reopened only by a manager+ | Anyone reopens | Protects revenue and loss metrics from casual edits |
| 4 | Optimistic concurrency via `version` | Last write wins; row locks | Cheap, stateless, clear UX |
| 5 | Kanban drag-and-drop with `@dnd-kit` | react-beautiful-dnd (unmaintained), native HTML5 DnD | Maintained, accessible, keyboard support |
| 6 | Cancel pending follow-ups on close | Leave them | Avoids ghost reminders |

## 9. Technical Plan Input
**Endpoint:** `PATCH /api/leads/:id/stage`
```json
// request
{ "to": "WON", "version": 4, "dealValue": 3650000, "vehicleModel": "aurora-suv", "appliedOfferId": "01J..", "reason": null }
{ "to": "LOST", "version": 4, "lostReason": "BOUGHT_ELSEWHERE", "lostNote": null }
// 200
{ "lead": { "id": "..", "stage": "WON", "version": 5, "dealValue": 3650000, "closedAt": 1790000000000, "score": 64, "priority": "WARM" },
  "activities": [ { "type": "STAGE_CHANGED", "metadata": { "from": "NEGOTIATION", "to": "WON" } } ] }
// 409 { "error": { "code": "VERSION_CONFLICT", "message": "...", "current": { ...lead } } }
// 422 { "error": { "code": "INVALID_TRANSITION" | "OFFER_NOT_APPLICABLE" | "VALIDATION", "message": "..." } }
```
Zod: `StageChangeSchema` is a discriminated union on `to` (in `packages/shared`).

**Kanban data:** `GET /api/leads?view=pipeline&groupBy=stage` (reuses F04 lead-query with `groupBy`), or `GET /api/pipeline` → `{ columns: [{ stage, count, valueCents, leads: [...] }] }`.

**Files:** `server/services/stage.ts` (`transition`, which uses `canTransition` from the F01-owned `packages/shared/src/stage-machine.ts` (`TRANSITIONS`, `canTransition(from,to,role)`, `autoAdvance`)), `components/leads/stage/{StageSelect,WonDialog,LostDialog}.tsx`, `app/(app)/pipeline/page.tsx`, `components/leads/stage/KanbanBoard.tsx`.

**Events:** emits `lead.updated`, `activity.created`. **Cache:** invalidate dashboard aggregates (F20 tag `dash:*`).

**Tests:** transition matrix unit test (every from×to×role), service test for WON/LOST required fields plus follow-up cancellation plus stage_history, 409 conflict test, RBAC test (a rep can't reopen), Playwright: drag a card and check it persisted.

## 10. Out of Scope
- Configurable pipelines per team, and custom stages.
- Probability-weighted forecasting.
- Undoing a stage change (fix it with another change instead).

## 11. Open Questions
- ~~Should WON create a `purchases` row?~~ **Resolved: yes**, in the same transaction (see `03-domain-model.md` → purchases).
- Should COLD be manually settable by reps? Proposed: manager+ only, otherwise system.

## 12. Spec Kit Prompts
**`/speckit.specify`**
> Sales leads move through a fixed pipeline: New, Contacted, Qualified, Test Drive, Negotiation, then Won or Lost, plus a dormant Cold stage for neglected leads. Salespeople change a lead's stage from its detail page or by dragging it on a board of stage columns. Only sensible moves are allowed: forward, back to an earlier open stage, to Lost from any open stage, Cold back to Contacted, and Lost reopened only by managers or VPs. Won is final. Winning requires the deal value in euros and optionally an applicable offer. Losing requires a reason (price, bought elsewhere, not ready, unreachable, financing declined, other with note). Every change is recorded in the lead's timeline and stage history with who and when. Closing a lead cancels its pending follow-ups. If two people edit the same lead at once, the second is told and shown the latest data. The board shows per-stage counts and total pipeline value in euros.

**`/speckit.plan`**
> Next.js App Router route handler `PATCH /api/leads/:id/stage` → Zod discriminated union → `authorize(user,'lead:changeStage'|'lead:reopen')` → `stageService.transition` in a Drizzle SQLite transaction (update leads with `WHERE version = ?`, insert stage_history plus STAGE_CHANGED activity, cancel follow-ups, recompute the score via F09), then publish `lead.updated`/`activity.created` on the Redis bus. Shared `stage-machine.ts` holds the transition table used by the server and the UI. Kanban at `/pipeline` using @dnd-kit with optimistic TanStack Query mutations and rollback on 409/422. Money is stored in integer cents and formatted with Intl de-DE EUR. Vitest for the matrix and service, Playwright for drag-and-drop.
