# Research: F18 AI Assist

| # | Decision | Rationale | Alternatives |
|---|---|---|---|
| 1 | Two endpoints: `suggest` (auto on open) and `draft` (on demand) | Draft depends on channel and is optional; saves tokens | One combined call |
| 2 | `client.messages.parse` + `zodOutputFormat`, `output_config.effort` from `AI_EFFORT` (default `low`), model `AI_MODEL` (default `claude-opus-5-5`) | Guaranteed schema; Zod is the standard here | Free-text parsing, tool use |
| 3 | Omit `thinking`; never send `budget_tokens` or `thinking:{type:"disabled"}`; no assistant prefill | Rejected with 400 on Opus 5.5 | — |
| 4 | Check `stop_reason` (`refusal`, `max_tokens`) before using `parsed_output` | Refusals carry no usable content | — |
| 5 | Typed SDK errors, most specific first: `RateLimitError`, `APIConnectionTimeoutError`/`APIConnectionError`, `APIError` → reasons `API_ERROR`, `TIMEOUT` | Uniform mapping to fallback reasons | — |
| 6 | Own rule-based fallback, not server-side model fallback | Single deterministic path for all failures | Beta `fallbacks` param |
| 7 | Fingerprint cache `sha1(promptVersion, lead.version, last_activity_at, sorted offerIds, channel?)`, TTL 24 h, Redis + in-proc LRU + single-flight promise map | Content-addressed freshness, free repeat views | TTL per lead |
| 8 | Rate limit: Redis `INCR`+`EXPIRE` on `rl:ai:{userId}` (3600 s), in-memory counter when degraded; limit from `AI_RATE_LIMIT_PER_HOUR` (30) | Constitution VII | — |
| 9 | Scrubber regex: emails, international phone numbers (+49/+33/+39 and generic 8+ digit runs), IBAN → `[redacted]`; name fields limited to first name | FR-003 | NER (overkill) |
| 10 | Delimited sections `<lead_data>`, `<activity_history>`, `<offers>`, `<customer_message>`; system prompt says content inside is data | FR-004 | — |
| 11 | Not streaming | Structured output validated whole; outputs short | Token streaming |
| 12 | Feedback logged only (route `/ai/feedback`) | No schema change (F01 owns) | Table |
| 13 | Logging: leadId, kind, model, latencyMs, tokens, cacheHit, source, fallbackReason; never text | FR-013 | — |
| 14 | Client query key `['ai','suggest',leadId,fingerprintHint]`, invalidated on `activity.created` / `lead.updated` | Fresh after changes | — |
| 15 | Open question effort `low` vs `medium`: answered by eval script, default stays `low` | Latency | — |

No NEEDS CLARIFICATION remain.
