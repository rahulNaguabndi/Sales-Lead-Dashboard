# F09 Assumptions (self-answered clarifications)

| Question | Answer | Source |
|---|---|---|
| Should NOT_INTERESTED subtract points? | No; engagement 0 | F09 §11 proposal |
| Do HOT thresholds differ per team? | No, global for v1 | F09 §11 proposal |
| What counts as "returning"? | Stored `customers.is_returning` flag | F09 §9 |
| Which activities count as "contact" for SLA? | USER activities with type ≠ NOTE (`first_response_at` null) | F09 FR-006, domain model §3 |
| Do the recompute callers publish events? | Yes, after commit; this feature only returns `{changed, priorityChanged}` | F09 FR-008/FR-009 |
| Any schema change needed? | No | F09 / constitution VI |
| Unknown source enum value? | 0 points, logged warning | F09 §5 |
| Sub-sections of spec with ambiguity? | None beyond above; no [NEEDS CLARIFICATION] markers | inferred |
