# F02 Assumptions (self-answered clarifications)

| # | Question | Answer | Source |
|---|---|---|---|
| 1 | Sliding sessions? | No, fixed 8 h | F02 doc §11 (proposed: no) |
| 2 | Disabled-account message timing | Only after correct credentials | inferred (F02 US-1.4 + FR-002 anti-enumeration) |
| 3 | Counter reset on success / behavior when limited | Reset on success; limited → 429 even for correct credentials until window ends | inferred (standard throttling) |
| 4 | Which attempts count as failures | INVALID_CREDENTIALS only | inferred from FR-009 "failed attempts" |
