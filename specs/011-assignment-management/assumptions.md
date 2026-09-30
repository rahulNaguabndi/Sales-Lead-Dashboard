# F11 Clarifications & Assumptions

| Question | Answer | Source |
|---|---|---|
| Should managers appear as auto-assign candidates? | No, reps only | F11 doc §11 proposal |
| Can reps release a lead back to the pool? | Out of scope (P2 extension) | F11 doc §11 / §10 |
| Hard dependencies F04/F10 not on this branch | Spec-only mode proceeds; code build must stub/merge them per README | inferred |
| Follow-up moving (F08 `reassignPending`) not yet present | Code against interface, stub until F08 merges | README same-wave soft deps |
| Does the bulk "return to pool" use the same endpoint? | Yes, `toUserId: null` | F11 doc §9 |
| Who can rebalance the pool? | Anyone with `team:configure` | inferred from FR-007 |
| Default personal limit | 25 open leads | F11 doc US-1 |
