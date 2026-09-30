# Research: F09 Lead Scoring

| Topic | Decision | Rationale | Alternatives |
|---|---|---|---|
| Score model | Rule-based additive, 5 factors | Transparent, deterministic (ADR-007) | ML / LLM: no training data |
| Location of logic | Pure module in `packages/shared` | Shared by seed, server, tests | Server-only service |
| Persisted reasons | Persist only the 5-number breakdown (existing column); derive reasons on demand | No schema change allowed | New column (needs an F01 change) |
| Timeline noise | SCORE_CHANGED only on band change | Avoids spam (D4) | Every change |
| Service API style | Synchronous, takes the caller's `Tx` | better-sqlite3 transactions are synchronous; caller owns atomicity | Async API |
| Freshness job | `recomputeFreshScores(now)` batched 200 per tx, scheduled by F08 | Bounded lock time on SQLite | One big tx |
| Purchase window | 5 × 365.25 days | Avoids leap-year drift | Calendar arithmetic |
| Version bump | Recompute does not increment `leads.version` | Score is derived, so no spurious optimistic-lock conflicts | Increment |
| Unknown enum | 0 points + warning | F09 §5 | Throw |
