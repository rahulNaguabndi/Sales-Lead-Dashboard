# F07 Assumptions (self-answered clarifications)

| Question | Answer | Source |
|---|---|---|
| Can reps set COLD manually? | No. Manager/VP only, otherwise system (`changedBy=null`). | F07 §11 proposal |
| Does WON create a `purchases` row? | Yes, same transaction; customer `is_returning=1`. | F07 §11 resolved, docs/03 |
| Behavior when F15 (offer matcher) is not merged? | Won dialog shows no offers; `appliedOfferId` given → `OFFER_NOT_APPLICABLE` via a stubbed matcher that returns `[]`. | README soft dependency |
| Behavior when F09 `scoreLead` is not merged? | Call through a thin adapter; no-op if absent. | README / inferred |
| Same-stage transition? | 200 no-op, no history. | F07 §5 |
| Who may reopen LOST? | MANAGER, VP (`lead:reopen`). | FR-008 |
| Kanban endpoint shape? | `GET /api/pipeline` returning columns (F07 owns it under `app/api/pipeline`), scoped like inbox. | F07 §9 option 2, inferred (avoids editing F04-owned files) |
| Column WON/LOST window? | Last 30 days by `closed_at`. | F07 US-6 |
| Deal value max? | 100,000,000 cents. | FR-004 |
