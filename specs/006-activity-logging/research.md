# Research: F06 — Activity Logging

| Topic | Decision | Rationale | Alternatives |
|---|---|---|---|
| Transaction model | Synchronous better-sqlite3 transaction via Drizzle `db.transaction` | All-or-nothing; no async gaps; matches the architecture | Multiple service calls (non-atomic) |
| Idempotency store | `clientRequestId` in `activities.metadata`, checked with `json_extract` in a 10-minute window | Works without Redis; no schema change | Redis keys; new table (schema is F01's) |
| Optimistic concurrency | `expectedVersion` checked only with a stage change | Notes append-only never conflict | Always-on version |
| Stage change location | Inline in `logActivity` using the shared state machine; switch to F07 `transition` when it lands | F07 is a later wave | Wait for F07 |
| Composer prefill store | React context, no new dependency | Constitution VIII | zustand |
| Score recompute | Synchronous `scoreLead` in the transaction | Header/inbox instantly correct | Async job |
| Event publish | After commit, errors logged and swallowed | FR-004, degradation rule | Publish inside transaction |
| Missing wave-1 code | Code against the documented contracts and stub `authorize`/`scoreLead`/`getCurrentUser` only in tests | Parallel builds | Block |

No NEEDS CLARIFICATION items remain.
