# F16 Assumptions (self-answered clarifications)

| Question | Answer | Source |
|---|---|---|
| Should the rep dashboard show a team rank? | No | F16 doc §11 default |
| Are stage-aging targets 3 days (NEW/CONTACTED) and 7 days (others) acceptable? | Yes, constants | F16 doc §11 / §7 |
| Revenue by `closed_at` in period or by `created_at` cohort? | `closed_at` | F16 doc §11 default |
| Is a hard dependency (F03/F07) absent from this branch? | Yes, specs only. Planning is against the documented contracts; implementation waits for wave 3 | inferred (spec-only run) |
| Where does a REP's "Due today" and "My open leads" come from? | Same scope-restricted queries as team metrics, with scope = own leads | inferred from US-5 |
| Which inbox params are used for drill-down? | F04 params: `from`, `to`, `team`, `owner`, `source`, `sourceGroup`, `stage`, `overdue`, `sla` | F16 doc §9 |
