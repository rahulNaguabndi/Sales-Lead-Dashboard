# Data Model: F18 AI Assist

No database tables or schema changes. Reads `leads`, `customers`, `activities`, `follow_ups`, `purchases`, `offers` (via F15 `matchOffers`). All structures below are in-memory or cache values (Redis `ai:*`, TTL 24 h).

## LeadAiContext (input to the model; built by `context.ts`)
| Field group | Fields |
|---|---|
| customer | firstName, ageBand, city, country, language, preferredChannel, secondaryChannel, bestTime, isReturning, purchases[{model, year}] |
| lead | stage, priority, score breakdown, source, vehicleModel, budgetBand (rounded to €5k), hasTradeIn, wantsFinance, testDriveRequested, leadAge, attemptCount, message (scrubbed) |
| activities (last 15) | type, outcome, note (scrubbed, ≤ 300 chars), relativeTime, actorRole |
| followUps (open) | relativeDue |
| offers (matched) | id, title, description, validTo |

Excluded always: email, phone, last name, customer id, user names, IPs.

## Suggest result
`{ source: AI|RULES, model?, cached, generatedAt, fingerprint, fallbackReason?, summary(≤600), nextBestAction{action, channel|null, timing(≤80), reason(≤300), offerId|null}, confidence }`

- `action`: CALL, WHATSAPP, SMS, EMAIL, SCHEDULE_TEST_DRIVE, SEND_OFFER, ESCALATE_TO_MANAGER, WAIT.
- Validation: `offerId ∈ matchedOfferIds` else null.

## Draft result
`{ source, model?, cached, generatedAt, fallbackReason?, templateLanguageNotice?, draft{channel, language(2), subject|null, body, offerId|null} }`

- Validation: `language == customer.language` else template; body ≤ 600 (WHATSAPP/SMS), ≤ 1000 (EMAIL); EMAIL has subject; WHATSAPP/SMS subject null.

## FallbackReason
`NO_API_KEY | TIMEOUT | API_ERROR | REFUSAL | MAX_TOKENS | INVALID_OUTPUT | RATE_LIMITED`

## Fingerprint
`sha1(PROMPT_VERSION | lead.version | lead.last_activity_at | sorted matchedOfferIds | channel?)`

## Feedback event (logged only)
`{ leadId, kind: suggest|draft, fingerprint, vote: up|down }`
