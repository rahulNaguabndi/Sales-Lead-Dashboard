# F05 — Lead Detail & Timeline

| Field | Value |
|---|---|
| **ID** | F05 |
| **Priority** | P0 |
| **Build wave** | 2 |
| **Depends on** | F02 (current user), F03 (policy `authorize`) |
| **Blocks** | F06 (composer slot), F07 (stage control), F08 (follow-ups slot), F14 (customer/channels slots), F15 (offers slot), F18 (AI slot) |
| **Personas** | REP, MANAGER, VP |
| **Challenge req.** | **R2**: clicking a lead shows its full details and a chronological log of all follow-up activities |
| **Owns (files/areas)** | `apps/web/app/(app)/leads/[id]/page.tsx` + `layout.tsx` + `not-found.tsx`, `apps/web/components/leads/detail/**` (including `slots.tsx`), `apps/web/components/timeline/**`, `apps/web/app/api/leads/[id]/route.ts` (GET), `apps/web/app/api/leads/[id]/activities/handlers/get.ts` (replaces the F01 501 stub; `route.ts` is an F01 delegating scaffold), `apps/web/server/services/lead-detail.ts` (`getLeadDetail`). `slots.tsx` receives append-only registrations from F06/F08/F14/F15/F18 (README ownership exception) |

## 1. Summary
The lead detail page is the rep's workspace for one lead. It shows **everything about the lead and customer at a glance** (identity, interest, history, score, ownership) and a **chronological timeline** that merges user-logged follow-ups with system events (created, assigned, stage changed, follow-up scheduled). The layout is a three-column shell with **named slots**, so later features (composer, channel actions, follow-ups, offers, AI) plug in without touching the page structure.

## 2. User Stories & Acceptance Scenarios

### US-1 (P1): Open a lead and see its full details · R2
*As a rep, I want to click a lead and immediately see who the customer is and what they want.*

**Independent test:** from the inbox, click a seeded lead. The header, customer card and interest card show values that match the DB.

1. **Given** I'm on `/inbox`, **When** I click "Giulia Conti", **Then** `/leads/{id}` loads, showing the header (name, reference `EDM-2026-00812`, stage chip, priority badge + score, owner, source, created date, Returning badge) and the Customer, Interest and History cards. *(R2)*
2. **Given** the customer card, **Then** it shows phone (E.164 formatted for display, e.g. "+39 347 123 4567"), email, city and country, age band, language, **preferred channel marked ★**, secondary channel, and best time to contact. *(R2)*
3. **Given** the interest card, **Then** it shows the vehicle model name and list price (€, `de-DE` format "38.900 €"), budget range, trade-in yes/no, finance interest yes/no, test drive requested yes/no, and the buyer's original message. *(R2)*
4. **Given** the customer is returning, **Then** the History card lists previous leads (reference, model, stage/outcome, date, each linking to the lead if it's in my scope) and purchases (model, amount €, date). **Given** the customer is new, **Then** the card says "First enquiry". *(R2)*

### US-2 (P1): See the chronological activity log · R2
*As a rep, I want the full history of this lead in time order, so I know exactly what's happened.*

1. **Given** a lead with 6 USER activities and 4 SYSTEM events, **When** the page loads, **Then** the timeline shows all 10 entries merged in time order, newest first by default, grouped under day headers ("Today", "Yesterday", "Mon 28 Sep"). *(R2)*
2. **Given** I toggle order to "Oldest first", **Then** the timeline reverses, and the preference persists (localStorage) across leads and reloads. *(R2)*
3. **Given** a USER entry, **Then** it shows a type icon, type label, outcome chip, the note (with line breaks, no HTML rendering), actor name and avatar, relative time ("3 h ago"), an "AI-assisted" marker if set, and the absolute timestamp on hover or focus ("30 Sep 2026, 14:05"). *(R2)*
4. **Given** a SYSTEM entry, **Then** it renders as a compact muted line, e.g. "⇄ Stage changed NEW → CONTACTED · by Sofia Rossi · 2 d ago", "→ Auto-assigned to Sofia Rossi · language match: it", "✚ Lead created from Facebook · Milano". *(R2)*
5. **Given** I filter the timeline to "Activities only", **Then** SYSTEM entries are hidden. "All" shows both. *(R2)*
6. **Given** more than 50 entries, **Then** the first 50 load and "Load older" fetches the next page (keyset). *(R2)*

### US-3 (P1): Access control without leaking existence
1. **Given** Sofia (Team South) opens the URL of a DACH lead, **Then** she sees the same "Lead not found" page as for a non-existent id (HTTP 404 from the API). Nothing about the lead is disclosed.
2. **Given** a lead in my scope where I'm not allowed an action (e.g. a rep viewing a team-pool unassigned lead), **Then** the page renders read-only, and action slots show "Claim this lead to work on it" (the claim action is F11). Action endpoints return **403** (visible but not permitted).
3. **Given** my session expired, **When** I open a lead URL, **Then** I'm redirected to `/login?next=/leads/{id}` and return there after login.

### US-4 (P1): Slots for later features
1. **Given** F06, F08, F14, F15 and F18 aren't built, **Then** each slot renders nothing (or a subtle placeholder in dev), and the page still fully satisfies R2.
2. **Given** a later feature registers its component in `slots.tsx`, **Then** it renders in the correct region with the lead context props, with no other change to the page.

### US-5 (P2): Score explanation
1. **Given** the priority badge "HOT 82", **When** I click it, **Then** a popover shows the breakdown from `score_breakdown` (Intent 27/35, Source 5/15, Customer 15/15, Freshness 20/20, Engagement 15/15) with the F09 rule labels.

### US-6 (P2): Responsive
1. **Given** a viewport under 1024 px, **Then** the columns collapse into tabs **Details · Timeline · Actions**, with Timeline as the default tab.

## 3. Functional Requirements
- **FR-001**: The system MUST render `/leads/[id]` with a header, a left column (Customer, Interest, History, Score cards), a center column (composer slot + timeline) and a right column (channels, follow-ups, offers and AI slots).
- **FR-002**: `GET /api/leads/:id` MUST return the lead, customer, owner, team, history (previous leads, purchases), follow-up summary and a `permissions` object computed by F03 policy.
- **FR-003**: The system MUST return **404 `NOT_FOUND`** both when the lead doesn't exist and when it's outside the user's read scope, and log out-of-scope attempts as a security warning (userId, leadId). It MUST return **403 `FORBIDDEN`** only for disallowed actions on leads the user can read.
- **FR-004**: `GET /api/leads/:id/activities` MUST return USER and SYSTEM activities for the lead ordered by `(created_at, id)` in the requested direction, with keyset pagination (`limit` default 50, max 100, `cursor` opaque).
- **FR-005**: The timeline MUST support an order toggle (desc default / asc) persisted client-side, and a filter `ALL | USER | SYSTEM`.
- **FR-006**: Every timestamp MUST show relative time (updated every 60 s) plus the absolute date and time in a tooltip and `<time dateTime>` attribute, in the user's locale and timezone (24 h).
- **FR-007**: SYSTEM entries MUST be rendered from `type` + `metadata` via a single formatter map (`formatSystemActivity`), so new system types can be added in one place.
- **FR-008**: User-entered text (notes, buyer messages) MUST be rendered as plain text with preserved line breaks, never as HTML.
- **FR-009**: The page MUST expose named slots `composer`, `channels`, `followUps`, `offers`, `ai`, `customerExtras`, and `headerActions`, each receiving `{ lead, customer, permissions, currentUser }`.
- **FR-010**: The page MUST be server-rendered (RSC) with initial data, then hand over to TanStack Query with keys `['lead', id]` and `['lead', id, 'activities', {order, kind}]`, so mutations (F06) and live events (F12) can update it.
- **FR-011**: The stage chip in the header MUST be read-only in F05. F07 replaces it with an editable control through the `headerActions` slot.
- **FR-012**: Money MUST display as EUR using `Intl.NumberFormat('de-DE', {style:'currency', currency:'EUR', maximumFractionDigits:0})`. Phone numbers are displayed in international format.
- **FR-013**: History MUST only link to previous leads the user can read. Others are listed without a link.
- **FR-014**: Opening a lead MUST NOT itself create an activity or modify the lead. Viewing is side-effect free.

## 4. Key Entities & Data
Reads `leads` (all columns), `customers`, `users` (owner, actors), `teams`, `activities`, `follow_ups` (next pending plus count), previous `leads` for the same customer, and `purchases`. No writes.

Vehicle names and prices come from the vehicle catalog in `packages/shared/src/enums.ts`. "Returning" is derived (prior lead or purchase).

## 5. Edge Cases & Error Handling
- Malformed id (not a ULID): 404 without a DB query.
- A lead with zero activities: the timeline shows only "Lead created" (every lead has a LEAD_CREATED system activity from seed or intake). If even that's missing, show "No activity yet".
- A deleted or deactivated owner or actor: shows the name with an "(inactive)" suffix. Null actor shows "System".
- Unknown SYSTEM activity type (added later without a formatter): generic render "{type} · {time}", no crash.
- Missing customer email or phone: the field shows "—". Channel slots (F14) handle disabling.
- Very long note (2000 chars): collapsed to 6 lines with "Show more".
- Lead reassigned away while open: the next refetch returns 404, and the UI shows the not-found state with "Back to inbox".
- Activities with identical `created_at`: the `id` (ULID) tiebreak keeps the order stable.
- Budget missing: "Not specified". Only a max given: "up to 40.000 €".

## 6. Success Criteria
- **SC-001**: `GET /api/leads/:id` and the first activities page each have p95 < 150 ms server time with seed data. The full page is interactive in < 1 s locally.
- **SC-002**: 100% of activities stored for a lead appear in the timeline (verified by a count assertion in tests), in the correct order in both directions.
- **SC-003**: The out-of-scope and non-existent lead responses are byte-identical in status and body.
- **SC-004**: A usability check: a new viewer can state the customer's preferred channel, vehicle and last contact outcome within 5 seconds of the page loading.

## 7. UX Notes
```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Giulia Conti  ↺ Returning   EDM-2026-00812   [QUALIFIED]  [HOT 82]  Owner: (SR) Sofia │
│ Facebook · created 28 Sep 2026 · 🇮🇹 Milano                         [headerActions ▸] │
├──────────────────┬──────────────────────────────────────┬────────────────────────────┤
│ CUSTOMER         │ [composer slot]                      │ [channels slot]            │
│ ★ WhatsApp · eve │ ─ Timeline ─  [All|Activities|System]│ [followUps slot]           │
│ +39 347 123 4567 │               [Newest ⇅]             │ [offers slot]              │
│ giulia@…  it  36-45│ TODAY                               │ [ai slot]                  │
│ INTEREST         │ ☎ Call · Connected · Sofia · 3 h     │                            │
│ Aurora SUV 38.900 €│   "Wants red, asks about 0% APR"    │                            │
│ Budget ≤ 40.000 €│ ⇄ Stage CONTACTED→QUALIFIED · 3 h    │                            │
│ Trade-in ✓ Fin ✓ │ YESTERDAY                            │                            │
│ HISTORY          │ 💬 WhatsApp · No answer · 1 d        │                            │
│ 2023 metro-hatch │ → Auto-assigned to Sofia · lang: it  │                            │
│ SCORE 82 (why?)  │ ✚ Lead created from Facebook         │                            │
│ 280 px           │ flex                                 │ 300 px                     │
└──────────────────┴──────────────────────────────────────┴────────────────────────────┘
```
- The page title is "Giulia Conti · EDM-2026-00812 · Lead Desk". The breadcrumb "Inbox / Giulia Conti" returns to the inbox with its previous URL state (via `history.back()` when the referrer is the inbox).
- Loading shows skeleton cards and 5 skeleton timeline items. An activities error shows an inline retry that doesn't break the rest of the page.
- Timeline type icons (lucide): Call `Phone`, WhatsApp `MessageCircle`, SMS `MessageSquare`, Email `Mail`, Meeting `Users`, Test drive `Car`, Note `StickyNote`. System: `Plus`, `ArrowRightLeft`, `UserCheck`, `CalendarClock`, `Snowflake`, `Tag`, `Gauge`.
- The not-found page says "Lead not found. It may not exist or you may not have access." with a "Back to inbox" button.
- The timeline is `role="feed"` with `aria-busy` while loading, and each entry is an `article` with an accessible label.

## 8. Decisions
| # | Decision | Alternatives | Rationale |
|---|---|---|---|
| 1 | One merged timeline for USER and SYSTEM entries | Separate tabs for activity and history | Full traceability in one chronological view. The filter toggle covers the "only activities" need |
| 2 | Newest first by default, with a persisted toggle to oldest first | Oldest first only | CRM convention (latest context on top). The toggle gives a strictly chronological reading when needed (R2) |
| 3 | 404 for both out-of-scope and missing; 403 only for disallowed actions on readable leads | 403 for out-of-scope | Doesn't leak lead existence across teams |
| 4 | Named slot registry (`slots.tsx`) | Each feature edits the page | Parallel Spec Kit streams without merge conflicts |
| 5 | Keyset pagination for activities | Offset | Stable under concurrent inserts (new activities arrive at the top) |
| 6 | System activity rendering via one formatter map | Pre-rendered text stored in DB | Keeps the DB structured, enables i18n later, one place to extend |
| 7 | RSC initial render plus TanStack Query cache | Client-only fetch | Fast first paint; shared cache keys for F06 optimistic updates and F12 invalidation |

## 9. Technical Plan Input (for `/speckit.plan`)

**`GET /api/leads/:id`** → 200
```json
{
  "lead": { "id": "01J9…", "reference": "EDM-2026-00812", "stage": "QUALIFIED", "priority": "HOT", "score": 82,
            "scoreBreakdown": { "intent": 27, "source": 5, "customer": 15, "freshness": 20, "engagement": 15 },
            "source": "FACEBOOK", "sourceDetail": "Autumn SUV campaign", "vehicleModel": "aurora-suv",
            "budgetMin": null, "budgetMax": 4000000, "hasTradeIn": true, "wantsFinance": true,
            "testDriveRequested": false, "message": "Interested in the red one…", "attemptCount": 0,
            "dealValue": null, "lostReason": null, "createdAt": 0, "assignedAt": 0, "firstResponseAt": 0,
            "lastActivityAt": 0, "closedAt": null, "version": 7 },
  "customer": { "id": "…", "firstName": "Giulia", "lastName": "Conti", "email": "giulia.conti@example.it",
                "phone": "+393471234567", "country": "IT", "city": "Milano", "ageBand": "36-45", "language": "it",
                "preferredChannel": "WHATSAPP", "secondaryChannel": "CALL", "bestTime": "EVENING", "isReturning": true },
  "owner": { "id": "…", "name": "Sofia Rossi", "avatarColor": "#7c3aed", "isActive": true },
  "team": { "id": "…", "name": "Team South" },
  "history": { "previousLeads": [{ "id": "…", "reference": "EDM-2023-00121", "vehicleModel": "metro-hatch",
                                   "stage": "WON", "createdAt": 0, "canView": true }],
               "purchases": [{ "vehicleModel": "metro-hatch", "amount": 2150000, "purchasedAt": 0 }] },
  "followUps": { "next": { "id": "…", "dueAt": 0, "status": "PENDING" }, "pendingCount": 1 },
  "permissions": { "canRead": true, "canLogActivity": true, "canChangeStage": true, "canAssign": false, "canClaim": false }
}
```
404 `{ "error": { "code": "NOT_FOUND", "message": "Lead not found" } }` · 401 `UNAUTHENTICATED`.

**`GET /api/leads/:id/activities?order=desc|asc&kind=ALL|USER|SYSTEM&limit=50&cursor=…`** → 200
```json
{ "items": [{ "id": "…", "kind": "USER", "type": "CALL", "outcome": "CONNECTED", "note": "Wants red…",
              "actor": { "id": "…", "name": "Sofia Rossi", "avatarColor": "#7c3aed" }, "aiAssisted": false,
              "metadata": {}, "createdAt": 0 },
            { "id": "…", "kind": "SYSTEM", "type": "STAGE_CHANGED", "outcome": null, "note": null,
              "actor": { "id": "…", "name": "Sofia Rossi" }, "metadata": { "from": "CONTACTED", "to": "QUALIFIED" },
              "createdAt": 0 }],
  "nextCursor": "base64(createdAt:id)" }
```
The cursor encodes `(created_at, id)`. The query is `WHERE lead_id=? AND (created_at, id) < (?, ?) ORDER BY created_at DESC, id DESC LIMIT ?` (mirrored for asc). F01 scaffolds `activities/route.ts`, which delegates `GET` to `handlers/get.ts` (owned by F05) and `POST` to `handlers/post.ts` (owned by F06), so the two streams never edit the same file.

**Services / repositories**
- `server/services/lead-detail.ts` (owned by F05): `getLeadDetail(user, id)` → `authorize(user, 'lead:read', lead)`; on deny throw `NotFoundError`.
- `listActivities(user, leadId, {order, kind, limit, cursor})`.
- Permissions via F03 `can(user, action, lead)` for `lead:read`, `activity:create`, `lead:changeStage`, `lead:assign`, `lead:claim`.

**Components**
- `components/leads/detail/`: `LeadHeader`, `CustomerCard`, `InterestCard`, `HistoryCard`, `ScoreCard` + `ScoreBreakdownPopover`, `DetailLayout` (3-column + responsive tabs), `slots.tsx`.
- `components/timeline/`: `Timeline`, `TimelineDayGroup`, `TimelineEntry` (USER), `SystemEntry`, `formatSystemActivity.ts`, `TimelineControls` (order + kind), `RelativeTime` (reused from F04 if present; otherwise `components/timeline/RelativeTime.tsx`).

**Slot registry** (`components/leads/detail/slots.tsx`)
```ts
export type LeadSlotProps = { lead: LeadDetail; customer: CustomerDetail; permissions: LeadPermissions; currentUser: SessionUser };
export const leadSlots: Record<'composer'|'channels'|'followUps'|'offers'|'ai'|'customerExtras'|'headerActions',
                               React.ComponentType<LeadSlotProps> | null> = {
  composer: null, channels: null, followUps: null, offers: null, ai: null, customerExtras: null, headerActions: null,
};
```
Later features change only their own key (a one-line, append-only style edit). This is the documented exception to path ownership.

**Tests**
- Unit: `formatSystemActivity` for every SYSTEM type plus unknown; cursor encode/decode; ordering with equal timestamps; EUR and phone formatting.
- Integration: 404 parity (out-of-scope vs missing: same status and body); REP/MANAGER/VP read matrix; permissions object per role; activities pagination completeness (sum of pages = count).
- E2E: part of `tests/e2e/core-loop.spec.ts` (see F04). Also `lead-detail.spec.ts`: toggle order → the first entry changes → reload → order persists; deep-link to an out-of-scope lead as Sofia → the not-found page.

## 10. Out of Scope
- The activity composer and logging (F06).
- Editable stage, won/lost dialogs (F07).
- Follow-up scheduling UI (F08). F05 only shows the next follow-up in the API payload.
- Channel buttons and deep links, message templates (F14).
- Offers panel (F15), AI card (F18).
- Editing customer details.

## 11. Open Questions
- Should viewing a lead be recorded (e.g. in the audit log) for compliance? Currently not recorded (FR-014).
- Resolved: `getLeadDetail` lives in a new `server/services/lead-detail.ts`, owned by F05 (listed in the README ownership table), avoiding a parallel conflict with F04's `lead-query.ts`.

## 12. Spec Kit Prompts
**`/speckit.specify`**
> Build the Lead Detail page for a car dealership sales tool. When a salesperson clicks a lead, they see everything about it on one screen: a header with customer name, lead reference, pipeline stage, priority and score (with an explanation of how the score was made up), owner, source, created date and a returning-customer marker; a customer card with contact details, city and country, age band, language, preferred and secondary contact channel and best time to contact; an interest card with the vehicle and its price in euros, budget, trade-in, financing and test-drive interest, and the customer's original message; and a history card with the customer's previous enquiries and purchases. The centre of the page is a timeline of everything that has happened on the lead, both follow-up activities logged by salespeople (calls, WhatsApp messages, emails, meetings, test drives, notes, with outcome and note) and automatic events (lead created, assigned, stage changed, follow-up scheduled), in time order, newest first by default with an option to read oldest first, grouped by day, showing who did it and when (relative time with exact time on hover), filterable to activities only, and loading older entries on demand. The page reserves clearly defined places for features that come later: an activity composer, contact-channel buttons, follow-ups, offers and AI suggestions. People must only see leads they are allowed to see; asking for a lead you're not allowed to see must look exactly like asking for one that doesn't exist. Viewing a lead must not change it.

**`/speckit.plan`**
> Next.js App Router in `apps/web`. `app/(app)/leads/[id]/page.tsx` is a Server Component that loads `getLeadDetail(user, id)` and the first page of `listActivities` from `server/services/lead-detail.ts`, then hydrates TanStack Query (`['lead', id]`, `['lead', id, 'activities', {order, kind}]`). API: `GET /api/leads/:id` and `GET /api/leads/:id/activities` (keyset pagination over `(created_at, id)`, limit 50, opaque base64 cursor), with Zod-validated params. Authorization through F03 `authorize(user,'lead:read',lead)`: deny maps to 404 `NOT_FOUND` identical to missing (logged as a security warning); a `permissions` object is returned for UI gating. Drizzle + SQLite. Components: `components/leads/detail/*` (header, cards, score popover, 3-column `DetailLayout` collapsing to tabs under 1024 px) and `components/timeline/*` (merged USER/SYSTEM timeline, day groups, `formatSystemActivity` map, order toggle persisted in localStorage, relative time refreshing every 60 s with `<time>` tooltips). Provide the `components/leads/detail/slots.tsx` registry with null slots `composer, channels, followUps, offers, ai, customerExtras, headerActions`. Render notes as plain text. EUR formatting `de-DE`. Tests: Vitest (formatter, cursor, formatting), integration (404 parity, RBAC matrix, pagination completeness), Playwright (core loop shared with F04/F06, order toggle persistence, out-of-scope URL).
