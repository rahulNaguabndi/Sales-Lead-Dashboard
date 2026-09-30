# F18 — AI Assist: Summary, Next Best Action, Draft Message

| Field | Value |
|---|---|
| **ID** | F18 |
| **Priority** | P1 |
| **Build wave** | 4 |
| **Depends on** | F05 (detail page AI slot, lead read model), F14 (customer preferences, channel deep links, message templates), F15 (offer matcher); F06 accepts the `aiAssisted` flag on activity creation (already in `CreateActivitySchema`, F01 §9.2 / F06 §9) |
| **Blocks** | — |
| **Personas** | REP (primary), MANAGER, VP (read on scoped leads) |
| **Challenge req.** | — (differentiator for the AI-native role) |
| **Owns (files/areas)** | `apps/web/server/services/ai/**`, `apps/web/app/api/leads/[id]/ai/**`, `apps/web/components/leads/ai/**` |

## 1. Summary
An "AI Assist" card on the lead detail page gives the rep three things: a short **summary** of who the customer is and what has happened, a **next best action** (what to do, on which channel, when, and why), and on request a **draft message** in the customer's language, suited to their preferred channel, that mentions an applicable offer. The card uses Claude through the Anthropic TypeScript SDK with structured output. No email addresses or phone numbers are sent to the model, results are cached per lead state, and a **deterministic rule-based fallback** (clearly labelled) means the feature always works, even with no API key or network.

## 2. User Stories & Acceptance Scenarios

### US-1 (P1): Lead summary
*As a rep picking up a reassigned lead, I want a 3–4 line summary so that I understand the customer in seconds.*

**Independent test:** Open any seeded lead with ≥ 3 activities. The summary appears within 8 s and mentions the model of interest, the latest outcome and the stage, in English (the UI language).

1. **Given** a lead with activities, **When** the rep opens the detail page, **Then** the AI card shows a loading skeleton, then a summary of ≤ 600 characters covering: who (first name, age band, city, returning or not), what (model, budget band, trade-in/finance, test drive), history (touch count, last touch and outcome), and current stage and priority.
2. **Given** the same lead with no changes, **When** the rep reopens it, **Then** the cached summary shows instantly (< 200 ms) with a "Generated 5 min ago" label.
3. **Given** a new activity is logged, **When** the card next renders, **Then** the summary regenerates, because the lead fingerprint changed.

### US-2 (P1): Next best action with reason
*As a rep, I want a concrete recommended next step with its reason so that I act on the right thing.*

1. **Given** Giulia (preferred channel WhatsApp, evenings, wants finance, a 0 % APR offer matched, last call unanswered twice), **When** the suggestion is generated, **Then** the next best action is like: action `SEND_OFFER`, channel `WHATSAPP`, timing "Today after 18:00", reason "Two unanswered calls; prefers WhatsApp in the evening; asked about financing: 0 % APR Autumn offer applies".
2. **Given** the suggestion references an offer, **When** it's displayed, **Then** the offer title links to the offer shown in the F15 panel, and `offerId` is guaranteed to be one of the lead's matched offers.
3. **Given** the next best action has a channel, **When** the rep clicks "Do it", **Then** the F14 channel action for that channel opens (deep link), and the composer is pre-filled.

### US-3 (P1): Draft message in the customer's language
*As a rep, I want a ready-to-send message in the customer's language and channel style so that I contact them faster and more personally.*

1. **Given** a customer whose language is `it` and whose preferred channel is WhatsApp, **When** the rep clicks "Draft message", **Then** a draft appears in Italian, short and conversational (≤ 600 characters, no subject), addressing them by first name and mentioning the applicable offer if any.
2. **Given** the rep picks channel Email instead, **When** the draft regenerates, **Then** it includes a subject line and a more formal tone (≤ 1000 characters).
3. **Given** the draft is shown, **When** the rep clicks "Use draft", **Then** the channel deep link opens with the text (WhatsApp/SMS/mailto body), the activity composer is pre-filled with type = channel and note = the draft, and the activity is saved with `aiAssisted = true` on submit.
4. **Given** the rep edits the draft before using it, **When** it's saved, **Then** `aiAssisted` is still true (it was AI-assisted, human-edited).

### US-4 (P1): Always works: rule-based fallback
*As a presenter, I want the feature to never break the demo.*

1. **Given** `ANTHROPIC_API_KEY` is unset, **When** the card loads, **Then** it shows a rule-based summary, next best action and template draft, with a visible "Rule-based" badge and a tooltip ("AI unavailable: showing rule-based suggestion").
2. **Given** the API times out (> 15 s), errors, refuses, or returns output that fails validation, **When** the request completes, **Then** the rule-based result is returned with `source: "RULES"` and `fallbackReason`, and the error is logged without prompt content.

### US-5 (P2): Transparency & control
1. **Given** any AI output, **When** displayed, **Then** it's labelled "AI-generated · check before sending" with a ↻ Regenerate button (rate-limited) and 👍/👎 feedback (logged).
2. **Given** a timeline entry created from a draft, **When** viewed, **Then** it shows a "✨ AI-assisted" chip.

## 3. Functional Requirements
- **FR-001**: The system MUST expose `POST /api/leads/:id/ai/suggest` (summary + next best action) and `POST /api/leads/:id/ai/draft` (draft for a channel). Both MUST authorize `lead:read` via F03 policy.
- **FR-002**: The system MUST build the model context with a **context builder** that includes only: customer first name, age band, city, country, language, preferred/secondary channel, best time, returning flag, past purchase models and years; lead stage, priority, score breakdown, source, vehicle model, budget band (rounded to €5k), trade-in/finance/test-drive flags, lead age, attempt count; the last 15 activities (type, outcome, note truncated to 300 chars, relative time, actor role); open follow-ups (relative due time); and matched offers (id, title, description, validity end).
- **FR-003 (PII minimization)**: The context MUST NOT include email, phone, last name, customer ID, internal user names or IP addresses. Free-text fields (activity notes, buyer message) MUST pass a scrubber that replaces email-, phone-, and IBAN-like patterns with `[redacted]`. A unit test MUST assert that no seeded email or phone string appears in any built prompt.
- **FR-004 (prompt-injection hygiene)**: Buyer messages and notes MUST be placed in clearly delimited data sections, and the system prompt MUST instruct the model to treat them as data, not instructions. Output is rendered as plain text (React-escaped) and is **never auto-sent**. The human always confirms.
- **FR-005 (structured output)**: Responses MUST be obtained via structured outputs (`client.messages.parse` with `zodOutputFormat`) and validated against the Zod schemas in §9. On a `null` `parsed_output` or a schema failure, fall back (FR-009).
- **FR-006 (post-validation)**: `nextBestAction.offerId` MUST be in the matched-offer IDs (otherwise set to null). `draft.language` MUST equal the customer's language (otherwise fall back to the template draft). `draft.body` length limits per channel: WhatsApp/SMS ≤ 600, Email ≤ 1000.
- **FR-007 (caching)**: Results MUST be cached under a content fingerprint `sha1(promptVersion, lead.version, lead.last_activity_at, sorted matchedOfferIds, channel?)` with a 24 h TTL (Redis; in-memory LRU when Redis is degraded). A cache hit MUST NOT call the API.
- **FR-008 (budgets)**: SDK timeout 15 s, `maxRetries: 1`. `max_tokens` 2000 for suggest and 1500 for draft. Per-user rate limit 30 generations/hour (Redis counter). Regenerate bypasses the cache but counts against the limit.
- **FR-009 (fallback)**: The system MUST return a deterministic rule-based result (§9 rules) when: no API key, timeout, API error, `stop_reason === "refusal"`, `max_tokens` stop, parse or validation failure, or rate limit exceeded. The response carries `source: "RULES"` and `fallbackReason`.
- **FR-010**: Every response MUST include `source` (`AI` | `RULES`), `generatedAt`, `cached` (bool), and for AI, `model`.
- **FR-011**: The UI MUST label AI output ("AI-generated") and rule output ("Rule-based") distinctly.
- **FR-012 (`ai_assisted`)**: When a draft is used, the composer MUST send `aiAssisted: true` in `POST /api/leads/:id/activities` (F06 contract). The timeline MUST show an "AI-assisted" chip for such activities.
- **FR-013 (observability)**: Log per call: leadId, kind, model, latency ms, input/output tokens (`usage`), cache hit, source, fallbackReason. **Never log prompt or completion text.** Feedback (👍/👎) is logged with leadId, kind and fingerprint.
- **FR-014**: The model MUST be configurable via `AI_MODEL`, default `claude-opus-5-5`, with `output_config.effort` configurable via `AI_EFFORT`, default `low` (latency-sensitive UI route).
- **FR-015**: The summary MUST be written in the UI language (English). The draft MUST be in the customer's language.

## 4. Key Entities & Data
Reads `leads`, `customers`, `activities`, `follow_ups`, `purchases`, `offers` (via the F15 matcher). Writes nothing directly. `activities.ai_assisted` is written by F06 when the flag is passed. No schema changes. The cache lives in Redis (`ai:*` keys, F20 naming scheme).

## 5. Edge Cases & Error Handling
- **Brand-new lead with no activities:** the summary is based on the enquiry only, and the next best action is usually "Contact now via preferred channel" (SLA).
- **WON/LOST leads:** the card shows the summary only. The next best action is "No action: closed" (rule-based, no API call). The draft is disabled.
- **COLD lead:** the next best action focuses on revival (best offer, preferred channel).
- **Customer language not in the template set** (for example `pl`): AI drafts in that language. The fallback template uses English, and the UI shows "Template in English".
- **No matched offers:** the draft doesn't mention offers. `offerId` is null.
- **Refusal (`stop_reason: "refusal"`):** always check `stop_reason` before reading content, then fall back with `fallbackReason: "REFUSAL"`.
- **Two tabs regenerating simultaneously:** single-flight per fingerprint (an in-process promise map). The second request awaits the first.
- **Lead changes during generation:** the result is cached under the old fingerprint. The UI compares the fingerprint to the current lead and shows "Lead changed · Regenerate".
- **Rate limit hit:** the rule-based result is shown with the notice "AI limit reached, try again in N min".
- **Very long histories:** only the last 15 activities, with notes truncated. Nothing else is silently dropped.

## 6. Success Criteria
- **SC-001**: p50 latency ≤ 4 s and p95 ≤ 8 s for uncached `suggest`. A cached response takes ≤ 200 ms.
- **SC-002**: 100 % of AI responses in the 10-lead golden set pass schema validation, language match, and offer-ID validity (eval script).
- **SC-003**: 0 occurrences of seeded emails or phone numbers in built prompts (unit test over all seeded leads).
- **SC-004**: With no API key, the card renders rule-based output for 100 % of leads with no errors.
- **SC-005**: Average cost ≤ €0.02 per uncached generation (~1.5k input + ≤ 600 output tokens at Opus 5.5 pricing of $4 / $20 per MTok ≈ $0.018). At most one generation per lead state thanks to caching.
- **SC-006**: A rep can go from opening a lead to sending an AI-drafted WhatsApp in ≤ 3 clicks.

## 7. UX Notes
Right column of the lead detail page (F05 slot "ai"), below the channel actions:
```
┌ ✨ AI Assist ─────────────── AI-generated · 2 min ago ↻ ┐
│ Giulia, 26–35, Milan · returning (bought Metro 2021).   │
│ Wants Luma EV, ~€40k, trade-in + finance. 4 touches;    │
│ last: call, no answer (yesterday). Stage QUALIFIED·HOT. │
│ ── Next best action ─────────────────────────────────── │
│ 💬 Send the 0% APR offer on WhatsApp · today after 18:00│
│ Why: 2 unanswered calls; prefers WhatsApp evenings;     │
│ asked about financing.                  [ Do it ]       │
│ ── Draft ─────────────────── [WhatsApp ▾] [Draft] ───── │
│ "Ciao Giulia! Sono Sofia di EuroDrive…"  [Use draft]    │
│ 👍 👎                         Check before sending      │
└─────────────────────────────────────────────────────────┘
```
- States: skeleton while loading (the card never blocks the page), error → fallback content with a "Rule-based" badge, disabled on closed leads.
- The "Rule-based" badge uses neutral styling, and "AI-generated" uses a sparkle icon. Color is never the only signal.
- Keyboard accessible. The draft textarea is editable before "Use draft".

## 8. Decisions
| # | Decision | Alternatives | Rationale |
|---|---|---|---|
| 1 | Two endpoints: `suggest` (auto on open) and `draft` (on demand) | One call producing everything; all on demand | The summary and next best action are always useful. The draft depends on the chosen channel and is optional, which saves tokens |
| 2 | Structured outputs via `client.messages.parse` + `zodOutputFormat` | Free-text parsing; tool use | Guaranteed schema. Zod is already the validation standard |
| 3 | Default model `claude-opus-5-5` at effort `low`, env-configurable | A smaller model | Skill default model. Low effort keeps latency acceptable. Configurable if cost or latency needs tuning |
| 4 | Deterministic rule-based fallback, labelled | Hide the card on failure | The demo never breaks, and it's honest about the source. The rules also serve as a baseline for evaluating AI quality |
| 5 | Fingerprint-keyed cache (lead version + last activity + offers + prompt version) | TTL-only per lead | Content-addressed: always fresh after changes, and free for repeat views. Bumping the prompt version invalidates everything |
| 6 | PII minimization + scrubber; no email/phone/last name | Send the full record | GDPR-minded. The model doesn't need contact details to reason |
| 7 | Human-in-the-loop: drafts never auto-sent | Auto-send via adapter | Safety and trust. The deep-link model requires a human anyway |
| 8 | Our own fallback on refusal rather than the server-side `fallbacks` parameter | Server-side model fallback (beta) | Simpler and uniform. Every failure mode ends in the same deterministic path. The server-side fallback can be added later in the plan phase if refusals show up in practice |
| 9 | Not streaming | Stream tokens into the card | Structured JSON is validated as a whole, and outputs are short. A skeleton is enough |

## 9. Technical Plan Input (for `/speckit.plan`)

**Endpoints**
```
POST /api/leads/:id/ai/suggest      body: {"regenerate": false}
200 {
  "source":"AI","model":"claude-opus-5-5","cached":false,"generatedAt":1759240000000,
  "fingerprint":"9f2c…",
  "summary":"Giulia, 26–35, Milan · returning customer …",
  "nextBestAction":{"action":"SEND_OFFER","channel":"WHATSAPP","timing":"Today after 18:00",
                    "reason":"Two unanswered calls; prefers WhatsApp evenings; asked about financing.",
                    "offerId":"off_01J…"},
  "confidence":"high"
}
POST /api/leads/:id/ai/draft        body: {"channel":"WHATSAPP"|"SMS"|"EMAIL","regenerate":false}
200 {"source":"AI","cached":false,"generatedAt":…,"draft":{"channel":"WHATSAPP","language":"it","subject":null,"body":"Ciao Giulia! …","offerId":"off_01J…"}}
Fallback: same shape with "source":"RULES","fallbackReason":"NO_API_KEY"|"TIMEOUT"|"API_ERROR"|"REFUSAL"|"MAX_TOKENS"|"INVALID_OUTPUT"|"RATE_LIMITED"
POST /api/leads/:id/ai/feedback     body: {"kind":"suggest"|"draft","fingerprint":"…","vote":"up"|"down"}  → 204 (logged only)
403 OUT_OF_SCOPE · 404 NOT_FOUND · 409 LEAD_CLOSED (draft on a WON/LOST lead)
```

**Module layout (`server/services/ai/`)**
- `context.ts`: `buildLeadContext(leadId): LeadAiContext` (FR-002), `scrubPII(text)` (FR-003).
- `prompts.ts`: `PROMPT_VERSION`, system prompt (frozen, first for prompt-cache friendliness), user message builder with `<lead_data>`, `<activity_history>`, `<offers>`, and `<customer_message>` delimited sections.
- `schemas.ts`: Zod
  ```ts
  const SuggestSchema = z.object({
    summary: z.string().max(600),
    nextBestAction: z.object({
      action: z.enum(["CALL","WHATSAPP","SMS","EMAIL","SCHEDULE_TEST_DRIVE","SEND_OFFER","ESCALATE_TO_MANAGER","WAIT"]),
      channel: z.enum(["CALL","WHATSAPP","SMS","EMAIL"]).nullable(),
      timing: z.string().max(80),
      reason: z.string().max(300),
      offerId: z.string().nullable(),
    }),
    confidence: z.enum(["low","medium","high"]),
  });
  const DraftSchema = z.object({
    channel: z.enum(["WHATSAPP","SMS","EMAIL"]), language: z.string().length(2),
    subject: z.string().max(120).nullable(), body: z.string().max(1000), offerId: z.string().nullable(),
  });
  ```
- `client.ts`: one shared `new Anthropic({ timeout: 15_000, maxRetries: 1 })` (TS timeout in **ms**), created only if a credential is configured.
- `generate.ts`: the call pattern
  ```ts
  const res = await client.messages.parse({
    model: env.AI_MODEL ?? "claude-opus-5-5",
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserMessage(ctx) }],
    output_config: { effort: env.AI_EFFORT ?? "low", format: zodOutputFormat(SuggestSchema) },
  });
  if (res.stop_reason === "refusal") return fallback("REFUSAL");
  if (res.stop_reason === "max_tokens" || !res.parsed_output) return fallback(...);
  ```
  Do **not** send `thinking: {type:"disabled"}` or `budget_tokens` (400 on Opus 5.5). Omit `thinking` and use effort. No assistant prefill. Catch typed SDK errors most-specific-first (`Anthropic.RateLimitError`, `Anthropic.APIConnectionTimeoutError`/`APIConnectionError`, `Anthropic.APIError`) → fallback with a mapped reason.
- `validate.ts`: post-validation (FR-006).
- `rules.ts`: the deterministic fallback, a pure function `ruleSuggest(ctx)` / `ruleDraft(ctx, channel)`. Rules evaluated in order, first match wins:
  1. Stage WON/LOST → `WAIT` "Lead closed".
  2. Stage NEW, no contact activity (USER, type ≠ NOTE) → preferred channel now; reason "New lead, respond within SLA".
  3. HOT and untouched > 30 min → `ESCALATE_TO_MANAGER`.
  4. `attempt_count ≥ 2` with the last outcome NO_ANSWER → switch to the secondary channel (or WhatsApp/SMS if the primary is CALL) at the customer's best time.
  5. `test_drive_requested` and stage before TEST_DRIVE → `SCHEDULE_TEST_DRIVE`.
  6. A matched offer whose eligibility fits (finance/trade-in/returning) → `SEND_OFFER` via the preferred channel.
  7. Stage COLD → revival via the preferred channel with the best offer.
  8. Default → follow up via the preferred channel at the best time.

  Summary template: "{firstName}, {ageBand}, {city}{ · returning}. Interested in {model} (~€{budget}){, trade-in}{, finance}. {n} touches; last: {type} – {outcome} ({relative}). Stage {stage} · {priority} {score}." Draft templates: `en, de, fr, it, es, nl, pt` × `WHATSAPP|SMS|EMAIL` with `{firstName} {repFirstName} {model} {offerTitle}` placeholders.
- `cache.ts`: `getOrGenerate(kind, fingerprint, fn)` with Redis `ai:{kind}:{leadId}:{fingerprint}` (TTL 86400) + single-flight + in-memory LRU fallback. Rate limit key `rl:ai:{userId}` (60-minute window).

**Components (`components/leads/ai/`):** `AiAssistCard`, `NextBestAction`, `DraftPanel` (channel select, editable textarea, Use draft → F14 `openChannel(channel, text)` + composer prefill via the F06 composer API, `aiAssisted: true`), `SourceBadge`, `FeedbackButtons`. Data via TanStack Query key `['ai','suggest',leadId,fingerprintHint]`. Invalidated on `activity.created` / `lead.updated` for this lead.

**Contract requests to other features (append-only):** F06 accepts `aiAssisted?: boolean` in the activity create schema. F05 renders the "AI-assisted" chip. F14 exports `openChannel(channel, text)` and the templates. F15 exports `matchOffers(leadId)`.

**Config:** `ANTHROPIC_API_KEY` (or an `ant auth login` profile), `AI_MODEL=claude-opus-5-5`, `AI_EFFORT=low`, `AI_RATE_LIMIT_PER_HOUR=30`.

**Tests:**
- Vitest: `scrubPII` (emails, +49/+33/+39 phones, IBAN), the context builder has no PII across all seeded leads, each `rules.ts` rule, the post-validator (bad offerId → null, wrong language → fallback), fingerprint stability, and fallback mapping for mocked SDK errors (timeout, refusal, parse null) with the SDK client mocked.
- Eval script `npm run eval:ai` (manual, costs money, requires a key): 10 golden leads covering schema validity, language match, offer validity, and a reason that mentions at least one real signal. The results are printed as a table.
- Playwright: with no key → the card shows the "Rule-based" badge. "Use draft" → the composer is prefilled → the saved activity shows the AI-assisted chip.

## 10. Out of Scope
- Auto-sending messages; chat agents that converse with customers.
- ML lead scoring (F09 stays rule-based).
- AI in dashboards/narratives (possible later).
- Storing AI outputs in the DB (cache only).
- Multi-turn chat with the AI about a lead.

## 11. Open Questions
- Should managers get a team-level "AI digest" (for example the top 5 leads at risk and why)? Default: out of scope.
- Is effort `low` good enough in quality? Compare with `medium` on the golden set during the plan phase.
- Should 👍/👎 feedback be persisted in a table for later evaluation? (That would need a schema change owned by F01.) Default: logs only.

## 12. Spec Kit Prompts
**`/speckit.specify`**
> On each lead's detail page, give the salesperson an assistant card that (1) summarizes the customer and everything that has happened so far in 3–4 lines, (2) recommends the single best next action (what to do, on which channel, when) with a short reason based on the lead's actual history, preferences and applicable offers, and (3) on request drafts a message in the customer's own language, in the style of their preferred channel (short for WhatsApp/SMS, with a subject for email), mentioning an applicable offer when there is one. The salesperson can edit the draft and send it through the customer's channel. The logged activity is marked as AI-assisted. Customer contact details (email, phone, surname) are never shared with the AI. Messages are never sent automatically. Suggestions are clearly labelled as AI-generated. If the AI is unavailable, slow or gives an unusable answer, a clearly labelled rule-based suggestion appears instead so the feature always works. Repeated views of an unchanged lead show the previous result instantly. Each user has an hourly limit on regenerations.

**`/speckit.plan`**
> TypeScript service under `apps/web/server/services/ai/` using the official `@anthropic-ai/sdk`: `client.messages.parse` with `zodOutputFormat` (structured outputs), model from `AI_MODEL` (default `claude-opus-5-5`), `output_config.effort` from `AI_EFFORT` (default `low`), no `thinking` param (never disabled or budget_tokens), no prefill, client `timeout: 15_000` ms, `maxRetries: 1`, check `stop_reason` for `refusal`/`max_tokens` before using `parsed_output`, typed SDK error handling. A context builder with PII scrubbing and delimited untrusted-data sections. Post-validation of offerId and language. A deterministic `rules.ts` fallback with multilingual templates. A Redis cache keyed by the content fingerprint (prompt version, lead version, last activity, offer IDs, channel), 24 h TTL, single-flight, LRU fallback. A Redis rate limit of 30/user/hour. Route handlers `POST /api/leads/[id]/ai/suggest` and `/draft` with F03 authorization. React components in `components/leads/ai/` wired to the F14 channel actions and the F06 composer (`aiAssisted: true`). Structured logs of latency/tokens/source with no prompt text. Tests: Vitest with a mocked SDK, a PII leak test over the seed data, and a manual eval script on 10 golden leads.
