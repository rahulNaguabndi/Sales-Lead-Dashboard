# F20 — Caching Strategy (Redis) · DECISION PENDING

| Field | Value |
|---|---|
| **ID** | F20 |
| **Priority** | P1 |
| **Build wave** | 4 |
| **Depends on** | F16 (dashboard functions to wrap), F12 (event bus used for invalidation); uses the F01 `server/cache/cache.ts` interface and Redis client |
| **Blocks** | — |
| **Personas** | All (indirect: speed); Engineering (operability) |
| **Challenge req.** | — |
| **Owns (files/areas)** | `apps/web/server/cache/**` (full strategy), plus small wiring PRs into the services named in §4 (`dashboard.ts`, `demographics.ts`, `offer-matcher.ts`, `policy/scope.ts`, `ai/cache.ts`), each limited to wrapping calls |

> **Status: the technique selection is intentionally left open.** The product owner wants to discuss caching techniques later in the process. This spec inventories what could be cached, compares the techniques, gives a **recommendation**, and lists the exact questions to settle. Items marked `[NEEDS CLARIFICATION]` must be resolved (via `/speckit.clarify` or a discussion) before `/speckit.plan`.

## 1. Summary
Add a Redis-backed caching layer that makes read-heavy screens (dashboards, analytics, offer lists, AI outputs) fast and keeps the database load flat as usage grows. Correctness comes first: a rep must see their own changes immediately (read-your-writes), and no cached value may ever leak across permission scopes. If Redis is unavailable, the app must stay fully functional, just slower.

## 2. User Stories & Acceptance Scenarios

### US-1 (P1): Fast dashboards on repeat views
*As a manager, I want the dashboard to load instantly when I come back to it so that checking the team is effortless.*

**Independent test:** Load the dashboard twice with the same filters. The second load's widget APIs return in < 100 ms, and the metrics report a cache hit.

1. **Given** Lukas loaded the 30-day dashboard, **When** he reloads within the freshness window and nothing changed, **Then** the widget responses are served from cache (< 100 ms), identical to the DB result.
2. **Given** a new lead is routed to Team DACH, **When** Lukas's dashboard next refetches, **Then** it reflects the new lead (the cache for Team DACH was invalidated or has expired according to the chosen staleness bound `[NEEDS CLARIFICATION: Q1]`).

### US-2 (P1): Read-your-writes for reps
*As a rep, I want my own changes to show up immediately so that I trust the tool.*

1. **Given** Sofia logs an activity, **When** the detail page and inbox refetch, **Then** they show the new activity and the updated `last_activity_at`. They're never served stale from cache.

### US-3 (P1): No cross-scope leakage
1. **Given** a manager's dashboard for Team DACH is cached, **When** Claire (Team West) requests her dashboard with the same filters, **Then** she never receives Team DACH's cached result (the scope is part of the key).

### US-4 (P1): Graceful degradation
1. **Given** Redis is stopped, **When** users use the app, **Then** every page works, values come from the DB, the logs show `cache: degraded`, and no request fails because of the cache.

### US-5 (P2): Observable effectiveness
1. **Given** caching is live, **When** an engineer checks the metrics, **Then** they see hit/miss/stale counts and the hit ratio per cache domain, plus Redis error counts.

## 3. Functional Requirements
- **FR-001**: The system MUST provide a cache module with a single API used by all features, for example `cache.wrap(domain, keyParts, loader, policy)`, so the technique can change without touching callers.
- **FR-002**: Cache keys MUST include every input that changes the result: the **scope identity** (a hash of the scope user/team set), normalized filters, the schema/prompt version, and the domain version/generation.
- **FR-003**: Data that must be read-your-writes (lead detail, the timeline, the inbox for the acting user) MUST either not be cached or be invalidated **synchronously before the write response returns**. `[NEEDS CLARIFICATION: Q2]`
- **FR-004**: Invalidation MUST be driven by the existing domain events (`lead.created`, `lead.assigned`, `lead.updated`, `activity.created`, `offer.changed`, plus hierarchy/team changes), with a TTL safety net on every key.
- **FR-005**: The cache MUST prevent stampedes (concurrent misses for the same key trigger one loader), using single-flight in-process plus an optional Redis lock.
- **FR-006**: If Redis errors or times out (> 50 ms per operation), the cache MUST bypass Redis and call the loader directly. After N consecutive failures it MUST open a circuit breaker for 30 s. Cache failures MUST NEVER fail a request.
- **FR-007**: The cache MUST record metrics per domain: hits, misses, stale-served, loader latency, Redis errors, and hit ratio. They're exposed in logs every 60 s and via `GET /api/internal/cache-stats` (VP only, dev tooling). `[NEEDS CLARIFICATION: Q6]`
- **FR-008**: Cached values MUST be JSON-serializable DTOs (never ORM entities), and MUST NOT contain secrets. PII-bearing values (AI drafts, customer data) have a TTL ≤ 24 h.
- **FR-009**: Authenticated API responses MUST send `Cache-Control: private, no-store` (no shared or HTTP caches for personalized data). Only public static assets and the Showroom vehicle catalog may be publicly cacheable.
- **FR-010**: Redis runs with `maxmemory 256mb` and `maxmemory-policy volatile-lru` (decided; F01 FR-005 `docker-compose.yml`). Under `volatile-lru` only keys with a TTL are evictable, so **every cache key MUST be written with a TTL** (whichever technique is chosen). Revocation (`auth:revoked:*`), rate-limit (`rl:*`), lock (`lock:*`) and notification-dedupe (`fu:notified:*`) keys also always carry TTLs. Demo-scale memory use (a few MB) never approaches the cap. This is an infrastructure decision and does not settle the pending technique questions (Q1–Q7).

## 4. Key Entities & Data — Cacheable Read Inventory
| # | Read | Called by | Cost today (seed data) | Change frequency | Staleness tolerance | Scope-dependent | Candidate |
|---|---|---|---|---|---|---|---|
| C1 | Dashboard KPIs & charts (F16) | Dashboard, every 5 s on live events | 5–50 ms per widget; grows linearly with leads | Every new lead or activity in scope | Medium (seconds to a minute) | Yes (scope + filters) | **Strong** |
| C2 | Demographics aggregates (F17) | Demographics tab | 20–80 ms | Low relevance per event | High (minutes) | Yes | **Strong** |
| C3 | Scope set (recursive CTE) (F03) | **Every** authenticated request | ~1 ms | Rare (hierarchy/team change) | Low for security (a revoked manager must lose access promptly) | Per user | Good (with explicit bust) |
| C4 | Active offers list (F15) | Offers strip on every page, matcher | ~1 ms | Rare (VP edits) + time boundaries (valid_from/to) | Must respect the validity window exactly | No | Good |
| C5 | Offer matches per lead (F15) | Lead detail, AI | ~2 ms | On lead field changes or offer changes | Low | No (per lead) | Weak–Medium |
| C6 | Lead detail aggregate (F05) | Lead detail | 3–10 ms | Every activity | **None** (read-your-writes) | Per lead (auth checked separately) | **Avoid** (or request-scoped memo only) |
| C7 | Inbox pages (F04) | Inbox | 5–20 ms | Constantly | None for the acting user | Per user × filters (huge key space) | **Avoid** |
| C8 | AI suggestion / draft (F18) | AI card | 2–8 s, ~€0.02 per call | On lead state change | Keyed by content fingerprint, so always fresh | Per lead | **Strong** (already specified in F18) |
| C9 | Current user profile for JWT → user (F02) | Every request | ~0.5 ms | Rare | Low (deactivation must apply promptly) | Per user | Optional |
| C10 | Team settings / assignment state (F10/F11) | Intake, assignment | ~0.5 ms | Rare | Low | Per team | Optional |

**Honest note for the discussion:** with SQLite and ~1k leads, most reads are already fast (ms). The measurable wins today are **C8 (AI: seconds and money)** and, under load or larger data, **C1/C2**. Caching C3–C5 is mostly about showing scale readiness. The recommendation below ranks items by value.

## 5. Edge Cases & Error Handling
- **Hierarchy change** (a rep moves teams, a manager changes): the scope sets for all affected users, and every dashboard key that embedded the old scope hash, must be unreachable. Scope-hash keys naturally stop matching, and old keys expire by TTL.
- **Offer validity boundary passes** (an offer expires at midnight) with no event: the offers cache TTL must not exceed the time until the next `valid_from`/`valid_to` boundary.
- **Event lost** (Redis pub/sub is fire-and-forget; subscriber down): the TTL safety net bounds staleness.
- **Multi-instance deployment:** invalidation must reach all instances (Redis-side keys/generations are shared, and in-process L1 caches must subscribe to events or have short TTLs).
- **Clock-based freshness** (the F09 freshness score) changes without events: dashboards that show score bands must use a TTL shorter than the score job interval (5 min).
- **Serialization of large payloads** (> 256 KB): skip caching and log a warning.
- **Cache poisoning via user input:** keys are built from normalized, validated filter values only (Zod), never raw strings.

## 6. Success Criteria
- **SC-001**: A cached dashboard widget responds in < 100 ms p95. Uncached stays < 500 ms (the F16 budget).
- **SC-002**: The dashboard cache hit ratio is ≥ 80 % during the scripted demo (repeat views and multiple viewers), measured by the FR-007 metrics.
- **SC-003**: 0 cross-scope leaks (property test: random users × filters → cached result equals the DB result for that user).
- **SC-004**: With Redis stopped, the full E2E suite passes, and p95 latency grows by no more than the uncached budgets.
- **SC-005**: After a write, the acting user sees the change on the next read in 100 % of E2E checks (read-your-writes).
- **SC-006**: AI generation calls per lead state = 1 (a repeat view never calls the API).

## 7. UX Notes
Caching is invisible except for: the "Updated 12 s ago" label on the dashboard (F16), which shows the cached data's `generatedAt`, and an optional "Refresh now" action that bypasses the cache (rate-limited). No other UI.

## 8. Decisions

### 8.1 Technique comparison
| Technique | How it works | Pros | Cons | Fit here |
|---|---|---|---|---|
| **Cache-aside (lazy loading)** | App reads the cache; on a miss it loads from the DB and writes the cache | Simple. Only caches what's used. The DB stays the source of truth. Easy degradation | First request is slow. The invalidation problem remains | ✅ **Default pattern** for C1–C5, C8 |
| **Read-through** | The cache library loads on a miss via a registered loader | Cleaner call sites | Needs a cache abstraction that owns the loaders. With Redis it's effectively cache-aside behind a wrapper | ✅ Implemented *as* a `cache.wrap()` wrapper around cache-aside |
| **Write-through** | Every write updates the DB and the cache synchronously | The cache is always fresh for written keys | Writes get slower. Aggregates (dashboards) can't be "written"; they're derived. Caches data that may never be read | ❌ Poor fit: our hot reads are aggregates |
| **Write-behind (write-back)** | Writes go to the cache and flush to the DB asynchronously | Very fast writes | **Risk of data loss** on a crash. Violates R3 ("activity must be persisted"). Complex | ❌ Rejected |
| **TTL-only expiry** | Keys expire after N seconds, with no explicit invalidation | Trivial. No event wiring | Stale up to the TTL. Short TTLs lose the benefit, and long ones confuse users | ⚠️ Only as a **safety net**, or for C2 (high tolerance) |
| **Event-driven invalidation** | Domain events delete or expire the affected keys | Fresh data with long TTLs | Must map events to keys correctly. Lost events are possible (the TTL covers that) | ✅ Uses the existing F12 bus |
| **Versioned / generation keys (tagging)** | The key embeds a generation counter per tag (for example `gen:team:DACH`). Invalidate = `INCR` the counter | O(1) invalidation of many keys (every filter combo for a team). No key scans. Atomic | Old keys linger until TTL/LRU (memory). One extra GET per read (it can be pipelined) | ✅ **Recommended** for C1/C2 (scope × filter explosion) |
| **Stale-while-revalidate (SWR)** | Serve a stale value immediately and refresh in the background after a soft TTL | Always-fast responses. Hides loader latency | Briefly stale data. Background refresh complexity | ⚠️ Good for C1/C2 **if** a few seconds of staleness is acceptable `[Q1]` |
| **Content-addressed (fingerprint) keys** | The key is a hash of all inputs, so the value is immutable | No invalidation needed. Perfect freshness | Only works when the inputs are cheap to compute | ✅ C8 (already in F18) |
| **In-process L1 (LRU) in front of Redis** | Per-instance memory cache with a very short TTL | Removes network hops for ultra-hot keys (C3, C4) | Per-instance staleness. Needs event subscription for busting | ⚠️ Optional for C3/C4 `[Q4]` |
| **HTTP caching (Cache-Control/ETag)** | The browser or CDN caches responses | Free for public assets | Personalized data must not be shared-cached. ETags still hit the server | ✅ Static assets and the Showroom catalog only. `private, no-store` for the API |
| **Next.js data cache (`unstable_cache`/`fetch` cache, `revalidateTag`)** | Framework-level caching of server data with tag revalidation | Integrated with RSC | Per-instance by default. Opaque. Easy to leak personalized data. Harder to explain and measure | ❌ Avoid for authenticated data. Keep `dynamic = "force-dynamic"` on app pages |

### 8.2 Recommendation (proposed, pending discussion)
1. **One module, `cache.wrap()`**: read-through semantics over **cache-aside** with Redis as the store. The DB remains the source of truth, so there's no write-through or write-behind.
2. **Dashboards and demographics (C1, C2):** **generation-versioned keys + event-driven invalidation + a TTL safety net**, optionally with **SWR** (soft TTL 15 s, hard TTL 5 min). Each event touching team T does `INCR gen:team:T` and `INCR gen:org`. VP keys use `gen:org`, team views use `gen:team:T`, and rep views use `gen:user:U`.
3. **Scope sets (C3):** cache per user, TTL 10 min, explicit bust on any user/team hierarchy change (`INCR gen:hierarchy`, embedded in the scope keys).
4. **Offers (C4):** a single key, busted on `offer.changed`. TTL = min(1 h, time to the next validity boundary).
5. **AI outputs (C8):** content-addressed keys, TTL 24 h (as in F18).
6. **Don't cache** lead detail (C6) or the inbox (C7) in Redis. Use request-scoped memoization only, which guarantees read-your-writes. Revisit if measurements show a need.
7. **Stampede protection:** in-process single-flight, plus `SET lock:{key} NX PX 5000` for multi-instance.
8. **HTTP:** `Cache-Control: private, no-store` on the authenticated API. Static assets are immutable. The Showroom catalog is `public, max-age=300`.

**Rationale:** it's correct by construction (scope in the key, read-your-writes preserved), invalidation is O(1) regardless of the number of filter combinations, it reuses the event bus we already have, it degrades cleanly, and each technique is simple to explain in the interview.

### 8.3 Key naming scheme
```
ld:{env}:{domain}:{version}:{...parts}        (all lowercase, ':' separated, values normalized)

Generations:  ld:dev:gen:org  ·  ld:dev:gen:team:{teamId}  ·  ld:dev:gen:user:{userId}  ·  ld:dev:gen:hierarchy  ·  ld:dev:gen:offers
Dashboard:    ld:dev:dash:v1:{widget}:s={scopeHash}:f={filtersHash}:g={gen}
Demographics: ld:dev:demo:v1:s={scopeHash}:f={filtersHash}:g={gen}
Scope:        ld:dev:scope:v1:u={userId}:h={genHierarchy}
Offers:       ld:dev:offers:v1:active:g={genOffers}
AI:           ld:dev:ai:{suggest|draft}:{leadId}:{fingerprint}
Locks:        ld:dev:lock:{fullKey}
Metrics:      ld:dev:metrics:cache:{domain}:{hit|miss|stale|error}
```
Note: F01's primitive `cache.ts` uses the prefix `cache:` (04-architecture §4). If this `ld:{env}:` scheme is adopted, F20 updates the prefix in F01's module (it owns `server/cache/**`). Generation and metrics keys are intentionally TTL-less. Every value key has a TTL (FR-010).
`scopeHash = sha1(sorted ownerIds + teamIds)` (first 12 hex). `filtersHash = sha1(canonical JSON of the Zod-parsed filters)`. `v1` = the DTO schema version (bumped on shape change).

## 9. Technical Plan Input (for `/speckit.plan`)
- `server/cache/cache.ts`: `wrap<T>(domain, parts, loader, {ttlSec, softTtlSec?, genTags?: string[]})`, `bump(tag)`, `invalidate(key)`, and a `stats()` interface. The implementation is `RedisCache` (ioredis, `commandTimeout: 50`, pipelined GET of the generations + value), plus `NoopCache` for degraded mode, selected by a circuit breaker.
- `server/cache/singleflight.ts`: a `Map<key, Promise>`.
- `server/cache/invalidation.ts`: subscribes to the F12 bus. Map: `lead.* | activity.created` → bump `team:{teamId}`, `user:{ownerId}` (and the previous owner on reassignment), `org`. `offer.changed` → bump `offers` + `org`. Hierarchy change → bump `hierarchy` + `org`.
- `server/cache/metrics.ts`: in-process counters flushed to logs every 60 s, plus Redis `INCRBY` for cross-instance totals.
- Wiring (thin wrappers, no logic changes): `dashboard.ts` functions, `demographics.ts`, `offer-matcher.getActiveOffers`, `policy/scope.scopeFor`, `ai/cache.ts` (align it with this module).
- Redis config (decided, in F01 FR-005): `maxmemory 256mb`, `maxmemory-policy volatile-lru`. Every cached value key is written with `SET … EX`. **Trade-off:** `volatile-lru` protects TTL-less control keys (generation counters `ld:*:gen:*`, metrics counters) from eviction. If they were evicted, every cached entry of a domain would silently invalidate or metrics would reset. The cost is that a TTL-less key written by mistake could never be evicted, so a unit test asserts that `cache.set`/`wrap` always pass a TTL. `allkeys-lru` (the earlier proposal) would evict anything, including generation counters, which is safe only if a missing generation is treated as "bump", adding complexity for no demo benefit.
- **Tests:** unit tests for the key builder normalization and the scope-hash stability; generation bump makes old keys unreachable; single-flight collapses 10 concurrent misses into 1 loader call; the circuit breaker opens and closes; the degraded mode returns loader values; a property test for cross-scope leakage (random scopes/filters: cached = DB); E2E with Redis stopped (the suite passes); a read-your-writes E2E check.
- **Measurement plan (before and after):** record the p50/p95 per widget and the hit ratio during a scripted demo run (`npm run simulate` + 3 concurrent dashboard viewers) to justify each cached domain.

## 10. Out of Scope
- CDN or edge caching.
- Caching write paths or queues.
- Redis Cluster/Sentinel HA (a single instance for the demo).
- Materialized rollup tables (an alternative scale path to discuss).

## 11. Open Questions — to settle in the caching discussion
- **Q1** `[NEEDS CLARIFICATION]` What staleness is acceptable on dashboards: **0 s** (strict event invalidation, no SWR), **≤ 15 s** (SWR), or **≤ 60 s** (TTL-only)?
- **Q2** `[NEEDS CLARIFICATION]` Confirm that lead detail and the inbox are **not** cached (request memoization only), or accept caching with synchronous invalidation.
- **Q3** `[NEEDS CLARIFICATION]` Invalidation style: **generation/versioned keys** (recommended) vs direct key deletion via tracked key sets vs TTL-only.
- **Q4** `[NEEDS CLARIFICATION]` Add an in-process L1 cache for the scope sets and offers, or keep Redis-only for simplicity?
- **Q5** `[NEEDS CLARIFICATION]` Is SWR (serving slightly stale data while refreshing) acceptable in the demo narrative, or should every view be strictly fresh?
- **Q6** `[NEEDS CLARIFICATION]` Where should the cache metrics be visible: logs only, an internal JSON endpoint, or a small "System" panel for the VP (a good demo moment)?
- **Q7** `[NEEDS CLARIFICATION]` Is **cache warming** on startup wanted (pre-compute the org and team dashboards for the default 30-day range) to make the first demo load instant?
- **Q8** Should Redis be **required** (fail fast at startup) or **optional** (degrade)? Current global decision D9 plus the architecture say optional/degrade. Confirm.

## 12. Spec Kit Prompts
**`/speckit.specify`**
> Make the sales lead tool's read-heavy screens (dashboards, demographic analytics, offer lists and AI suggestions) respond almost instantly on repeat views, and keep database load low as usage grows, by remembering recently computed results. Correctness is more important than speed: a salesperson must always see their own changes immediately, remembered results must never be shown to someone with different access rights, and results must refresh when the underlying leads, activities or offers change. If the result store is unavailable the tool must keep working normally, only slower. Engineers must be able to see how often remembered results are used versus recomputed. Some choices are deliberately open and must be clarified before planning: how stale dashboard numbers may be, whether any lead lists or lead pages are remembered, whether slightly stale results may be shown while refreshing, whether results are pre-computed at startup, and where effectiveness metrics are shown.

**`/speckit.plan`** (to be finalized after the Q1–Q8 answers)
> Redis 7 via ioredis behind a single `cache.wrap()` API in `apps/web/server/cache/`: cache-aside with read-through ergonomics, generation-versioned keys (`gen:org`, `gen:team:{id}`, `gen:user:{id}`, `gen:hierarchy`, `gen:offers`) bumped by an invalidation subscriber on the F12 event bus, a TTL safety net per domain, optional stale-while-revalidate for dashboards, in-process single-flight plus a Redis `SET NX PX` lock, a circuit breaker with a 50 ms command timeout and a Noop fallback, and metrics counters. Key scheme `ld:{env}:{domain}:{v}:s={scopeHash}:f={filtersHash}:g={gen}`. Wrap the F16/F17 dashboard functions, the F03 scope resolver, the F15 active offers, and align the F18 AI cache. No caching of lead detail/inbox. `Cache-Control: private, no-store` on the authenticated API. Redis `maxmemory 256mb volatile-lru` (already configured by F01; every value key has a TTL). Tests: key normalization, generation invalidation, single-flight, breaker/degraded mode, a cross-scope property test, read-your-writes E2E, and before/after latency measurements.
