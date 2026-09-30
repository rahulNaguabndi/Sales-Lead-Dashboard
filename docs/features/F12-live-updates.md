# F12 — Live Updates (SSE + Redis pub/sub)

| Field | Value |
|---|---|
| **ID** | F12 |
| **Priority** | P1 |
| **Build wave** | 3 |
| **Depends on** | F01 (event bus `server/events/bus.ts`, event types in `packages/shared/src/events.ts`), F03 (scope), F04 (inbox queries/keys), F10 (lead.created producer) |
| **Blocks** | F20 (event-driven cache invalidation) |
| **Personas** | REP, MANAGER, VP |
| **Challenge req.** | — (headline demo moment, UF-3) |
| **Owns (files/areas)** | `apps/web/app/api/events/**`, `apps/web/lib/sse/**`, `apps/web/components/live/**`; ownership exception: replaces the **body only** of F04's `components/leads/inbox/live-slot.ts` (`useInboxLive()` returns the highlighted IDs from `liveStore`) |

## 1. Summary
Implements decision D6. A Server-Sent Events stream pushes lead and activity events to each signed-in user, filtered to their visibility scope. Services publish domain events on Redis pub/sub. Each web process subscribes once and fans the events out to its open SSE connections. On the client, a single hook invalidates the relevant TanStack Query caches, shows toasts and highlights new or changed rows. This is what makes "submit in the Showroom and it appears in the inbox" work without a refresh. If Redis is down it degrades to an in-process emitter.

## 2. User Stories & Acceptance Scenarios

### US-1 (P1): New lead appears live
*As a rep, I want new leads assigned to me to appear instantly.*

**Independent test:** With the inbox open as Anna Weber, POST a DE lead to the intake API. Within 2 s a toast appears and the row is inserted at the right position with a highlight, with no reload.

1. **Given** I'm on `/inbox`, **When** a lead is auto-assigned to me, **Then** within 2 s I see the toast "New HOT lead · Anna Schmidt · Aurora SUV · assigned to you" with an "Open" action, and the inbox list refetches, showing the new row highlighted (a yellow fade over 3 s).
2. **Given** I'm a DACH rep and a lead lands in the DACH unassigned pool, **Then** my Unassigned tab count increments live and a subtle toast "New lead in team pool" appears.
3. **Given** I'm a South rep, **Then** I receive **no** event about a DACH lead.

### US-2 (P1): Managers and VPs see team/org activity
1. **Given** Lukas (DACH manager) is on the dashboard, **When** any DACH lead is created, assigned, or changes stage, **Then** the dashboard KPIs refetch (debounced to at most once per 5 s), and the Team Inbox updates.
2. **Given** Isabelle (VP), **Then** she receives events for all teams.

### US-3 (P1): Lead detail stays current
1. **Given** I have lead X open, **When** a colleague logs an activity or changes its stage, **Then** the timeline and header update within 2 s, with a small "Updated by Lukas Becker just now" note.
2. **Given** lead X is reassigned away from me (out of my scope), **Then** I see a banner "This lead was reassigned to Lea Hoffmann" and the actions are disabled.

### US-4 (P1): Resilient connection
1. **Given** my laptop sleeps or the server restarts, **When** the connection comes back, **Then** the client reconnects automatically (browser EventSource retry, server `retry: 3000`). After reconnecting it refetches the active queries, so nothing is missed even if events were dropped.
2. A connection status dot in the top bar shows green "Live", amber "Reconnecting…" or grey "Offline". It has a tooltip and text for accessibility.

### US-5 (P2): Degraded mode
1. **Given** Redis is unavailable, **Then** the app logs `Redis: degraded`, the bus uses an in-process EventEmitter, and live updates still work in a single-process `npm run dev`.

## 3. Functional Requirements
- **FR-001**: `GET /api/events` MUST authenticate with the `ld_session` cookie (the same `getCurrentUser()` as other routes). Unauthenticated requests get 401 (no stream).
- **FR-002**: The response headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, `X-Accel-Buffering: no`. Runtime: Node.js (not edge). `dynamic = 'force-dynamic'`.
- **FR-003**: The stream sends `retry: 3000` on connect, then an initial `event: hello` with `{userId, serverTime}`.
- **FR-004**: A heartbeat comment `: ping` every **25 s** keeps proxies from closing idle connections.
- **FR-005**: Each message has the format `id: <ulid>\nevent: <type>\ndata: <json>\n\n` where the type is one of the catalog events (docs/03 §5): `lead.created`, `lead.assigned`, `lead.updated`, `activity.created`, `followup.due`, `offer.changed`.
- **FR-006**: **Scope filter** per subscriber: deliver if `event.ownerId ∈ scopeUserIds`, or (`event.ownerId == null` and `event.teamId ∈ scopeTeamIds`), or (`lead.assigned` and `fromOwnerId ∈ scopeUserIds`, so the previous owner can remove the row), or the user is VP. `offer.changed` goes to everyone. `followup.due` goes only to `assignedTo`.
- **FR-007**: The scope (user IDs and team IDs) is computed at connect time via F03 `scopeFor(user)` and **refreshed every 60 s** or on `lead.assigned` events that involve a team change. Token revocation or expiry closes the stream at its next refresh.
- **FR-008**: Server fan-out: one Redis subscriber per process on channel `leaddesk:events`. It holds an in-memory `Set<Connection>`, and each connection has its own filter. Payloads are Zod-validated against the shared event schema. Invalid messages are logged and dropped.
- **FR-009**: Producers MUST publish **after** the DB transaction commits (`bus.publish` is called by services post-commit).
- **FR-010**: **Last-Event-ID (best effort):** the server keeps a ring buffer of the last 500 events per process (in memory). If a reconnect sends `Last-Event-ID` found in the buffer, it replays the newer events that pass the filter. Otherwise it sends `event: resync`, and the client refetches everything.
- **FR-011**: Client hook `useLiveEvents()` (mounted once in the app layout) opens `EventSource('/api/events')` and maps events to query invalidations:
  - `lead.created` / `lead.assigned` → invalidate `['leads', …]` (inbox lists and counts), `['followups']`, `['dashboard']` (debounced 5 s)
  - `lead.updated` → invalidate `['lead', id]`, `['leads']`, `['pipeline']`
  - `activity.created` → invalidate `['lead', leadId, 'activities']`
  - `followup.due` → toast only, plus `['followups']`
  - `offer.changed` → `['offers']`, `['lead', *, 'offers']`
  - `resync` / reconnect → `queryClient.invalidateQueries()`
- **FR-012**: Toast rules: a toast for `lead.assigned` to me (HOT gets a red accent and stays 8 s, others 5 s), a pool arrival (grouped when there are more than 3 within 10 s: "4 new leads in team pool"), `followup.due`, and a reassignment away from me. Events caused by the **current user** do not toast (compare `event.by` with me).
- **FR-013**: Row highlight: a store of recently changed lead IDs (TTL 5 s), exposed to the inbox through F04's `useInboxLive()` hook in `components/leads/inbox/live-slot.ts` (F12 replaces the stub body). Inbox rows in the set get a `data-highlight` animation. It respects `prefers-reduced-motion` (a static background instead).
- **FR-014**: Connection limits: at most 5 concurrent streams per user (the oldest is closed). Streams are closed on `request.signal` abort, and the listener is removed to avoid leaks.

## 4. Key Entities & Data
No new tables. It uses the shared `DomainEvent` union from `packages/shared/src/events.ts`: `{ id, type, at, teamId, ownerId, by?, payload }`.

## 5. Edge Cases & Error Handling
- Several browser tabs: each opens its own stream (within the limit of 5). That's acceptable. BroadcastChannel sharing is out of scope.
- Next.js dev hot reload creates duplicate subscribers: guard the bus with a `globalThis.__ldBus` singleton.
- The event arrives before the refetch sees the committed data: publishing happens post-commit, and SQLite WAL readers see committed data.
- The user logs out in another tab: the stream gets 401 on reconnect, and the client redirects to `/login`.
- A burst of 100 simulated leads: invalidations are debounced per query key (250 ms), and toasts are grouped.
- A corporate proxy buffering SSE: the heartbeat and `X-Accel-Buffering` help. Document a polling fallback (`refetchInterval: 30s` when the status is Offline for > 60 s).

## 6. Success Criteria
- **SC-001**: Intake POST → toast visible for the correct user in < 2 s (p95, local).
- **SC-002**: 0 cross-scope leaks. A test asserts that a South rep's stream receives none of 20 DACH events.
- **SC-003**: The stream survives 10 minutes idle (heartbeats) and reconnects within 5 s after a server restart.
- **SC-004**: With Redis stopped, live updates still work in single-process dev.

## 7. UX Notes
- The top bar has a status dot plus the label "Live". Toasts appear bottom-right via shadcn Sonner, with at most 3 visible.
- A toast shows the priority dot, name, model and source badge, plus "Open" and "Dismiss" buttons.
- New-row highlight: a pale amber background fading over 3 s.
- The lead detail shows an "Updated just now by X" note next to the header.

## 8. Decisions
| # | Decision | Alternatives | Rationale |
|---|---|---|---|
| 1 | SSE | WebSockets, Socket.IO, polling | One-way push, native browser reconnect, plain HTTP, and it works in Next route handlers |
| 2 | Events trigger **refetch** (invalidate) rather than patching caches | Apply the event payload to the cache | Simpler and always consistent with server authorization and sort order. Payloads are small anyway |
| 3 | Redis pub/sub with an in-process fallback | Only in-process; Redis Streams | Multi-instance ready. Streams (durable replay) are overkill for the demo |
| 4 | Filter on the server per subscriber | Client-side filtering | Security: never send out-of-scope data |
| 5 | In-memory ring buffer for Last-Event-ID | No replay; Redis Streams | A cheap best effort. `resync` covers gaps |
| 6 | Don't toast your own actions | Toast everything | Reduces noise |

## 9. Technical Plan Input
**Route:** `apps/web/app/api/events/route.ts`
```ts
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  const user = await getCurrentUser(); if (!user) return new Response(null, { status: 401 });
  const stream = new ReadableStream({ start(controller) { /* register connection, write retry/hello, heartbeat interval, replay */ } });
  req.signal.addEventListener('abort', () => { /* unregister, clear intervals */ });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' } });
}
```
**Server modules:** `lib/sse/hub.ts` (connection registry, ring buffer, `broadcast(event)`, `filterFor(scope)` pure), subscribing to `bus.subscribe(handler)` from F01.
**Example wire message**
```
id: 01J9Z3K8Q2...
event: lead.assigned
data: {"type":"lead.assigned","at":1790000000000,"teamId":"t_dach","ownerId":"u_anna","by":null,"payload":{"leadId":"l_123","fromOwnerId":null,"toOwnerId":"u_anna","method":"AUTO","summary":{"name":"Anna Schmidt","priority":"HOT","score":78,"vehicleModel":"aurora-suv","source":"WEBSITE"}}}
```
**Client:** `lib/sse/useLiveEvents.ts`, `lib/sse/liveStore.ts` (Zustand or a React context: status, highlighted IDs), `components/live/{LiveStatusDot, LiveToaster, useRowHighlight}.tsx`.
**Tests:** unit tests for `filterFor` (all scope cases), a hub test (register, broadcast, abort cleanup, ring buffer replay), an integration test (start the route, publish via the bus, read the stream), and a Playwright test with two browser contexts (showroom POST → inbox toast).

## 10. Out of Scope
- Durable delivery guarantees (Redis Streams or Kafka).
- Browser push notifications or service workers.
- Presence ("Lukas is viewing this lead").

## 11. Open Questions
- Should the dashboard update in true real time or be debounced? Proposed: debounce 5 s. Revisit alongside F20 caching.
- Is a notification sound for HOT leads wanted in the demo? Proposed: off by default, with a toggle.

## 12. Spec Kit Prompts
**`/speckit.specify`**
> Screens update in real time without refreshing. When a new lead arrives or is assigned, the right people see it within two seconds: the assigned salesperson gets a notification and the lead appears highlighted in their inbox, team members see their team pool update, and managers and VPs see their team or organisation views update. People never receive updates about leads they aren't allowed to see. An open lead page reflects colleagues' changes (new activities, stage changes, reassignment) as they happen. Users don't get notified about their own actions. A small indicator shows whether live updates are connected, and after a network drop or server restart the screen reconnects and catches up on its own. Live updates keep working even if the shared messaging component is unavailable, in a single-server setup.

**`/speckit.plan`**
> Next.js Node-runtime route handler `GET /api/events` returning a ReadableStream (SSE) authenticated by the JWT cookie. `lib/sse/hub.ts` holds per-process connections with per-subscriber scope filters (F03 `scopeFor`, refreshed every 60 s), a 25 s heartbeat, `retry: 3000`, and a 500-event ring buffer for Last-Event-ID replay, otherwise `resync`. Subscribes to the F01 bus (ioredis pub/sub on `leaddesk:events`, globalThis singleton, EventEmitter fallback). Payloads are Zod-validated with the shared event types. The client `useLiveEvents` hook uses EventSource → debounced TanStack Query invalidations, Sonner toasts, and a row-highlight store respecting prefers-reduced-motion. Tests: Vitest for the filter and hub, Playwright with two contexts for showroom → inbox.
