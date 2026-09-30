# F01 Assumptions

| Question | Answer | Source |
|---|---|---|
| Redis in CI? | Not required; tests run in memory mode | research.md |
| EUR locale | de-DE | docs/04-architecture.md |
| Stage transition table details | Forward/backward among open stages, WON terminal, COLD/LOST restricted by role | inferred from data-model.md state machine |
| Seed "now" | Truncated to the hour for reproducible resets | inferred (SC-002) |
| Working hours timezone | UTC | inferred |
