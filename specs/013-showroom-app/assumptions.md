# F13 Assumptions (self-answered clarifications)

| Question | Answer | Source |
|---|---|---|
| Honeypot 202 `{status:'accepted'}` has no reference: what to show? | Normal thank-you, generic copy, no reference | Inferred (F13 §5 "no client hint", §9 response list) |
| 415 / unexpected status handling | Treated as server error banner + Retry | Inferred |
| Budget range to cents | Both bounds in cents; "< 20k" omits min, "55k+" omits max | Inferred from FR-005 |
| Idempotency key lifetime | New per form open / after success; retries reuse | F13 FR-008, D7 |
| Open questions "Similar offers" / burst location | No similar offers; burst in both showroom and F10 CLI | F13 §11 proposals |
