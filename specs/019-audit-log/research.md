# Research: F19 Audit Log

| Topic | Decision | Rationale | Alternatives |
|---|---|---|---|
| Pagination | Keyset on `(created_at, id)` with opaque cursor | Stable and O(limit) on append-only table | Offset (scans, drift) |
| Scope | Join to leads' current team + actor subtree + own entries | No schema change, mirrors inbox visibility | Stored team_id at write time (schema change) |
| Tuple compare | Expanded `OR` form | Portable across SQLite versions and Drizzle | Row-value comparison |
| Action prefix | `LIKE 'prefix.%'` with escaped input | Simple, index-friendly enough at this scale | Separate action-group column |
| Ref resolution | Batch `IN` queries per page | Avoids N+1 (Constitution IX) | Per-row lookups |
| Failed-login PII | sha256 emailHash only (writer by F02/F01) | Pattern detection without PII | Plaintext |
| Conformance helper | `expectAudited(action, entityId)` test helper | Lets each feature assert FR-001 | Per-feature bespoke asserts |
| Dependencies | None new | Constitution VIII | — |

No NEEDS CLARIFICATION remain.
