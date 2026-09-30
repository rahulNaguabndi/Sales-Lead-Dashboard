# F10 Assumptions (self-answered clarifications)

| # | Question | Answer | Source |
|---|---|---|---|
| 1 | Should the assignee's first name be revealed to the buyer? | Yes, first name only | F10 §11 default |
| 2 | Does sticky-owner cross teams? | Yes, owner and their team | F10 §11 resolved, FR-012 |
| 3 | Is `customers.is_returning` stored or derived? | Stored column, set by F10 during dedupe | F10 §11 / domain model |
| 4 | What if an idempotency key is replayed with a different payload? | Return the original reference (duplicate), ignore the new payload | inferred |
| 5 | Which network address is used for rate limiting behind a proxy? | First `X-Forwarded-For` entry if present, else the connection address; `unknown` if neither | inferred |
| 6 | Does a sticky owner at capacity still receive the lead? | No, sticky rule is skipped and normal routing continues; reason recorded | F10 §5 |
| 7 | Is the honeypot check before or after key auth and rate limit? | After auth, rate limit and validation; bots with no valid key get 401 | F10 §9 modules order |
| 8 | Which language is used for LANGUAGE_MATCH when the enquiry has none? | The payload language field is required by the shared contract; if absent, treated as no-match fallback | inferred (F01 §9.2) |
| 9 | Do hard dependencies F03/F09 exist on this branch? | Not yet (spec-only, wave 2); plan codes against their documented interfaces (`scoreLead`, team/hierarchy data) and stubs them at merge | build-feature step 0.3 / README |
