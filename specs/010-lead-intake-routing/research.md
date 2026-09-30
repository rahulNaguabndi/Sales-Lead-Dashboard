# Research: F10 Lead Intake

| # | Topic | Decision | Rationale | Alternatives |
|---|---|---|---|---|
| 1 | Phone normalization | `libphonenumber-js` `parsePhoneNumberFromString(raw, country)`; invalid → field error; `getType()` for the non-mobile channel warning | Handles national, `+CC` and `00CC` forms (SC-005) | Regex (wrong), Google libphonenumber (heavy) |
| 2 | Constant-time key compare | `crypto.timingSafeEqual` on SHA-256 digests of the provided key vs each configured key, no early exit | Avoids length leakage and timing side channels | Plain `===` |
| 3 | Rate limiting | Redis `INCR` + `EXPIRE 60` on first hit at `rl:intake:<name>:<ip>`; in-memory window map as fallback; `Retry-After` from TTL | Architecture §4 and Constitution VII | Sliding window (more code) |
| 4 | Client IP | First `X-Forwarded-For` entry, else `x-real-ip`, else `unknown` | Route handlers have no socket IP | none |
| 5 | Body size | Check `Content-Length`, then read text and enforce byte length ≤ 10 240 (413) | Header may be absent or wrong | Header only |
| 6 | Assignment serialization | Redis lock plus in-process mutex; selection and insert inside one better-sqlite3 transaction | Correct single-instance without Redis, and multi-instance with it | DB-only |
| 7 | Reference generation | Per-year `max+1` inside the transaction, unique index, one retry | FR-017 | Sequence table (schema change, forbidden) |
| 8 | Concurrency tests | 50 parallel `ingest()` on a temp SQLite file; assert unique references and balanced counts | SC-003 / SC-004 | none |
| 9 | Simulator determinism | Seeded faker and a seeded PRNG for source mix and returning choice; returning phones from the F01 seed customer generator with the same `SEED` (function import only, no DB) | FR-021 | DB read |
| 10 | Simulator pacing | Interval = 60 000 / rate ms with sequential awaited posts; `--burst` uses `Promise.all` | US-7 | Overlapping timers |

## Dependencies on other features (not present on this branch)

| Needed | From | Interface assumed | If absent |
|---|---|---|---|
| Schema, Drizzle client, `writeAudit`, `bus`, `getRedis`, `redisStatus`, `AppError`, `IntakeLeadSchema`, `COUNTRIES`, seed customer generator | F01 (hard, earlier wave) | per F01 §9 | F01 must be merged first |
| `scoreLead(input, now)` | F09 (wave 1) | `packages/shared/src/scoring.ts`, F09 FR-001 | Local adapter returning a neutral score; logged in the report |
| Team and user data | F03 data + F01 seed | tables `teams`, `users` | none |

## Requires F01 change (recorded, not made here)

F01 §9.2 defines `lead.assigned` as `{ leadId, fromOwnerId, toOwnerId, method }`. F10 §9 also sends `strategy` and `reason`. F10 publishes them as optional members; F01's event type needs `strategy?: string; reason?: string` appended. Until then F10 casts through a local extended type.

The simulator's console line shows team, assignee and score, but the public response (FR-020) exposes only the reference, status, assignee first name and expected contact. The simulator therefore prints what the response contains and omits team and score when unavailable (deviation to record in the report and amend in the F10 doc if kept).
