# F18 Assumptions (self-answered clarifications)

| # | Question | Answer | Source |
|---|---|---|---|
| 1 | Should managers get a team-level "AI digest"? | No, out of scope | F18 §11 default |
| 2 | Is effort `low` good enough? | Default `low`; compare with `medium` on the golden set (eval script) | F18 §11 |
| 3 | Persist 👍/👎 feedback in a table? | No, logs only (would need an F01 schema change) | F18 §11 default |
| 4 | Model fallback on refusal? | Own rule-based fallback, no server-side fallback model | F18 §8 decision 8 |
| 5 | Streaming? | No, a skeleton is enough | F18 §8 decision 9 |
| 6 | Who may call the endpoints? | Anyone with `lead:read` on the lead (REP/MANAGER/VP in scope) | F18 FR-001, F03 |
| 7 | Hard dependencies F05/F14/F15 not on this branch | Spec-only run; at build time code against the interfaces named in their specs (`matchOffers`, `openChannel`, slots.tsx) and stub them | README "soft dependencies", inferred |
| 8 | Seeded-lead PII test | Runs over all seeded leads via the deterministic seed (`SEED=42`) | Constitution V |
| 9 | How is 👍/👎 logged, and what happens on a draft for a closed lead? | Added `POST /api/leads/:id/ai/feedback` (204, logged only) and `409 LEAD_CLOSED`; F18 doc §9 amended accordingly | inferred (F18 US-5, Edge Cases) |
| 10 | Who verifies the timeline "AI-assisted" chip? | F05 owns the timeline; F18 verifies it and files a contract request if missing | F18 §9, README ownership |
