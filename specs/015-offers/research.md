# Research: F15 Offers

| Decision | Rationale | Alternatives |
|---|---|---|
| Declarative eligibility JSON, AND semantics, strict Zod | Covers dealership promos, explainable, no deps | json-rules-engine; code per offer |
| Pure shared matcher | Reused by API, WON validation, AI context; trivially testable | SQL matching |
| Fail closed on unknown keys | Never show a non-entitled offer | Ignore unknown |
| Validity boundary Europe/Brussels end of day | Doc FR-002; one offset helper using `Intl.DateTimeFormat` with `timeZone`, no date library | date-fns-tz (extra dep) |
| Cache via F01 interface, key `cache:offers:active` | FR-008; F20 sets the TTL | No cache |
| Live updates via bus event `offer.changed`, with refetch fallback | Works before F12 lands | Polling only |
| WON integration through exported service helper | F07 owns WON; avoids cross-owner edits | Edit F07 files |
| One applied offer per lead | Decision 4 | Stacking |

No NEEDS CLARIFICATION remain.
