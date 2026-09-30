# Research: F08

| Topic | Decision | Rationale | Alternatives |
|---|---|---|---|
| Scheduler | `setInterval` from `instrumentation.ts` with a `globalThis` guard | No infra; documented scale path is BullMQ | BullMQ, cron |
| Multi-process safety | Redis `SET lock:job:<name> NX PX 55000`; run anyway if Redis is down | Matches architecture §6 and degradation rule | DB advisory lock |
| Due-soon dedupe | Redis `SET fu:notified:<id> NX EX 3600`; in-memory `Set` fallback | Exactly-once toast per follow-up | DB column (schema change not allowed) |
| At-risk | Derived at read time by pure `isAtRisk` | Cheap; no persisted state | Stored flag |
| COLD | Persisted via F07 `stageService.transition`, `changedBy=null` | Funnel history | Direct UPDATE |
| Same-wave stubs | Adapter with dynamic import + logged fallback | Merge order independence | Hard import |
| System entry types | SYSTEM `FOLLOW_UP_SCHEDULED` with `metadata.action` | No SYSTEM `NOTE` in enum; schema frozen | Change enum (F01) |
| Time | UTC ms in DB; browser-local rendering and quick picks | DST safe | Server-side zones |
| Env overrides | Zod-parsed positive floats, read once at module init | Demo-friendly | Settings table |
| Timer tests | Vitest fake timers plus injected `now` | Deterministic | Real waits |
