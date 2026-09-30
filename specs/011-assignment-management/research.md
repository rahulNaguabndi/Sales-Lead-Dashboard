# Research: F11 Assignment Management

| Topic | Decision | Rationale | Alternatives |
|---|---|---|---|
| Claim race safety | Conditional UPDATE inside a synchronous better-sqlite3 transaction | Atomic, no lock infra | SELECT-then-UPDATE; distributed lock |
| Per-team auto-assign serialization | Redis `SET lock:assign:<teamId> NX PX 5000` + in-process promise-chain mutex fallback | Constitution VII; also protects against multi-process | No lock (double-pick) |
| Round-robin cursor | `teams.rr_cursor` holds the last picked user id; next = first active rep whose name sorts after that user's name (name looked up even if now inactive; missing user → start from the beginning) | Matches the "deactivated cursor" edge case | Index-based cursor (breaks on roster change) |
| Follow-up move | Call F08 `reassignPending` via a thin interface with a no-op stub | Same-wave soft dependency | Direct SQL (would duplicate F08 rules) |
| Dependencies F04/F10 | Stub/merge at integration; `autoAssign` is exported for F10 | Parallel wave build | — |
| Extra endpoints | `GET /api/teams/settings`, `GET /api/teams/:id/assignees`, `POST /api/teams/:id/rebalance` | Needed by §9 and US-6 | — |
| New npm packages | None | Simplicity | — |
