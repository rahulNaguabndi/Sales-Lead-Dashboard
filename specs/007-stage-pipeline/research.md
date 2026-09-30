# Research: F07 Stage Pipeline

| Decision | Rationale | Alternatives |
|---|---|---|
| Single transition table in `packages/shared/src/stage-machine.ts`, enforced server-side and mirrored in UI | One source of truth, testable 8×8 matrix | UI-only validation |
| Optimistic concurrency via `leads.version` in `UPDATE … WHERE version=?` | Cheap, stateless, clear UX | Row locks, last-write-wins |
| Backward moves allowed between open stages | Real sales regress (failed test drive) | Forward-only |
| WON terminal; LOST reopen manager+ | Protects revenue/loss metrics | Anyone reopens |
| `@dnd-kit/core` for Kanban | Maintained, keyboard + touch sensors | react-beautiful-dnd (unmaintained), native HTML5 DnD (poor touch/a11y) |
| Dedicated `GET /api/pipeline` | Avoids editing F04-owned `lead-query`; returns per-column count/value in one call | `groupBy` on `/api/leads` |
| Offer matcher and scoring behind local stub interfaces | Same-wave soft deps (F15) and earlier-wave F09 may be absent on this branch | Block on merge |
| Internal callers use `ctx.system` + optional `ctx.tx` | Lets F06/F08 reuse the service without HTTP or double transactions | Duplicate logic in F06/F08 |
| Cold set manually: manager+ only | F07 §11 proposal | Reps may set Cold |
