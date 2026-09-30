# F08 Assumptions

| # | Question | Answer | Source |
|---|---|---|---|
| 1 | Which stages count as "open" for at-risk/auto-COLD? | All except COLD, WON, LOST | Domain model / F08 doc ("NEW…NEGOTIATION") |
| 2 | Does a snoozed follow-up still protect from the 7-day rule? | Yes, if still future-dated | Inferred (F08 Decision 5) |
| 3 | Does an overdue PENDING follow-up protect from the 7-day rule? | No, only future-dated | F08 US-5.3 |
| 4 | Does supersede cross assignees? | No, per (lead, assignee) | F08 FR-002 |
| 5 | Unanswered rule vs future follow-up | Unanswered rule always applies | F08 US-5.3 |
| 6 | Hard/soft dependencies (F06, F07, F09) are not yet on this branch in spec-only mode | Proceed with specs only; stubs are planned for F07 `stageService.transition` and F09 `recomputeFreshScores` | Inferred: spec-only writes no code |
| 7 | MISSED digest / score penalty (F08 §11) | Not built: dashboard-only P2; no score penalty | F08 doc proposals |
