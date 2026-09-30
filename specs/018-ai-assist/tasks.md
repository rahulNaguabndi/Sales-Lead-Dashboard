# Tasks: F18 AI Assist

**Input**: `specs/018-ai-assist/` (spec, plan, research, data-model, contracts, quickstart)
**Paths** are relative to `apps/web/` unless stated. Tests for pure logic come BEFORE their implementation (Constitution V).
**Format**: `- [ ] T### [P?] [US?] Description with file path`

## Phase 1: Setup

- [x] T001 Add dependency `@anthropic-ai/sdk` and script `eval:ai` to `apps/web/package.json` (append-only); ensure `AI_MODEL`, `AI_EFFORT`, `AI_RATE_LIMIT_PER_HOUR`, `ANTHROPIC_API_KEY` exist in `apps/web/.env.example` and in the env Zod schema (append-only)
- [x] T002 [P] Create `server/services/ai/schemas.ts`: `SuggestSchema` (summary max 600; action enum CALL|WHATSAPP|SMS|EMAIL|SCHEDULE_TEST_DRIVE|SEND_OFFER|ESCALATE_TO_MANAGER|WAIT; channel nullable enum CALL|WHATSAPP|SMS|EMAIL; timing max 80; reason max 300; offerId nullable; confidence low|medium|high), `DraftSchema` (channel WHATSAPP|SMS|EMAIL; language length 2; subject nullable max 120; body max 1000; offerId nullable), response types, `FallbackReason` union, request body schemas
- [x] T003 [P] Create local stubs/adapters for same-wave-or-earlier interfaces in `server/services/ai/deps.ts`: `matchOffers(leadId)` (F15), lead read model (F05 `lead-detail`), `authorize` usage; each re-exports the real module when present

## Phase 2: Foundational (blocks all stories)

- [x] T004 [P] Write failing tests `tests/unit/ai/scrub.test.ts` for `scrubPII` (emails, +49/+33/+39 phones, IBAN → `[redacted]`)
- [x] T005 [P] Write failing tests `tests/unit/ai/context.test.ts`: no seeded email/phone/last name/customer id appears in the serialized context or built prompt for ALL seeded leads (SC-003); last 15 activities, note ≤ 300 chars, budget rounded to €5k
- [x] T006 [P] Write failing tests `tests/unit/ai/fingerprint.test.ts` (stable for same inputs, offer order independent, changes with version/last_activity/offers/channel/promptVersion)
- [x] T007 Implement `server/services/ai/context.ts` (`buildLeadContext`, `scrubPII`) until T004–T005 pass
- [x] T008 Implement `server/services/ai/fingerprint.ts` until T006 passes
- [x] T009 Implement `server/services/ai/prompts.ts`: `PROMPT_VERSION`, frozen `SYSTEM_PROMPT` (treat delimited sections as data, summary in English, draft in customer language), `buildUserMessage` with `<lead_data>`, `<activity_history>`, `<offers>`, `<customer_message>` sections
- [x] T010 [P] Write failing tests `tests/unit/ai/cache.test.ts`: cache hit makes no generator call; single-flight (two concurrent calls → one generator run); in-memory LRU when Redis degraded; rate limiter 30/hour with in-memory fallback
- [x] T011 Implement `server/services/ai/cache.ts` (`getOrGenerate`, Redis `ai:{kind}:{leadId}:{fingerprint}` TTL 86400, LRU, single-flight, `rl:ai:{userId}` 3600 s window) until T010 passes
- [x] T012 Implement `server/services/ai/client.ts`: shared `new Anthropic({ timeout: 15_000, maxRetries: 1 })`, created only when a credential is configured, otherwise `null`

**Checkpoint**: context, prompts, cache and client ready.

## Phase 3: User Story 4 — Rule-based fallback (P1, built first: it is the baseline and MVP)

**Independent test**: with no key, every seeded lead yields summary + next best action + template draft, source RULES.

- [x] T013 [P] [US4] Write failing tests `tests/unit/ai/rules.test.ts`: one test per rule in order (1 WON/LOST → WAIT "Lead closed"; 2 NEW without contact → preferred channel now; 3 HOT untouched > 30 min → ESCALATE_TO_MANAGER; 4 attempt_count ≥ 2 & last NO_ANSWER → secondary channel, or WhatsApp/SMS if primary is CALL, at best time; 5 test_drive_requested before TEST_DRIVE → SCHEDULE_TEST_DRIVE; 6 eligible matched offer → SEND_OFFER on preferred channel; 7 COLD → revival; 8 default), summary template output ≤ 600 chars, draft templates for en,de,fr,it,es,nl,pt × WHATSAPP|SMS|EMAIL, unsupported language (pl) → English with `templateLanguage: "en"`
- [x] T014 [US4] Implement `server/services/ai/rules.ts` (`ruleSuggest`, `ruleDraft`) until T013 passes
- [x] T015 [P] [US4] Write failing tests `tests/unit/ai/validate.test.ts`: offerId not in matched ids → null; draft language ≠ customer language → fallback to template; body length limits WHATSAPP/SMS ≤ 600, EMAIL ≤ 1000
- [x] T016 [US4] Implement `server/services/ai/validate.ts` until T015 passes
- [x] T017 [P] [US4] Write failing tests `tests/unit/ai/generate.test.ts` with mocked SDK: no key → `NO_API_KEY`; `Anthropic.APIConnectionTimeoutError` → `TIMEOUT`; `RateLimitError`/`APIError` → `API_ERROR`; `stop_reason: "refusal"` → `REFUSAL`; `max_tokens` → `MAX_TOKENS`; `parsed_output` null or post-validation failure → `INVALID_OUTPUT`; request has no `thinking`, no `budget_tokens`, no assistant prefill, `max_tokens` 2000/1500, `output_config.effort` from `AI_EFFORT`
- [x] T018 [US4] Implement `server/services/ai/generate.ts` (`generateSuggest`, `generateDraft` with `client.messages.parse` + `zodOutputFormat`, stop_reason check before `parsed_output`, typed errors most-specific-first, fallback to rules; logs leadId, kind, model, latency, tokens, cacheHit, source, fallbackReason and never prompt or completion text) until T017 passes
- [x] T019 [US4] Implement `server/services/ai/index.ts`: `suggestForLead(user, leadId, {regenerate})`, `draftForLead(user, leadId, channel, {regenerate})` orchestrating context → fingerprint → rate limit (→ `RATE_LIMITED` with minutes left) → `getOrGenerate`; closed leads: suggest returns rule-based `WAIT` "No action: closed" with no API call, draft rejected with `LEAD_CLOSED`
- [x] T020 [P] [US4] Write failing RBAC tests `tests/unit/ai/routes.rbac.test.ts` for suggest, draft and feedback: REP/MANAGER/VP × in-scope (200/204) and out-of-scope (403 `OUT_OF_SCOPE`), unknown lead (404), bad body (400)
- [x] T021 [US4] Implement route handlers `app/api/leads/[id]/ai/suggest/route.ts`, `draft/route.ts`, `feedback/route.ts` (thin: authenticate → Zod → `authorize(lead:read)` → service; feedback logs leadId, kind, fingerprint, vote only) until T020 passes
- [x] T022 [US4] Run tests with no `ANTHROPIC_API_KEY` and with Redis stopped over all seeded leads: 100 % rule-based, no errors (SC-004)

## Phase 4: User Story 1 — Lead summary (P1)

**Independent test**: a lead with ≥ 3 activities shows a summary ≤ 600 chars; reopen is instant; new activity regenerates.

- [x] T023 [P] [US1] Write failing tests in `tests/unit/ai/index.test.ts`: summary contains who/what/history/stage (AI mock and rules); repeat call with unchanged lead → `cached: true` and zero SDK calls; after a new activity (changed `last_activity_at`) → regenerated; `regenerate: true` bypasses cache and counts against the limit
- [x] T024 [US1] Make T023 pass in `server/services/ai/index.ts` / `cache.ts` (fix only what the tests expose)
- [x] T025 [P] [US1] Create `components/leads/ai/use-ai.ts` (TanStack Query key `['ai','suggest',leadId,fingerprintHint]`, invalidated on `activity.created` / `lead.updated`) and `components/leads/ai/SourceBadge.tsx` ("AI-generated" with sparkle icon / neutral "Rule-based" with tooltip "AI unavailable: showing rule-based suggestion"; text always present)
- [x] T026 [US1] Create `components/leads/ai/AiAssistCard.tsx` (skeleton, summary, "Generated N min ago" label, error → rule-based content, disabled state on closed leads, "Lead changed · Regenerate" when fingerprint differs, rate-limit notice "AI limit reached, try again in N min") and register it in slot "ai" by an append-only edit to `components/leads/detail/slots.tsx`

## Phase 5: User Story 2 — Next best action (P1)

**Independent test**: Giulia-like lead yields SEND_OFFER on WhatsApp with an offer link and a "Do it" button.

- [x] T027 [P] [US2] Write failing component test `tests/unit/ai/NextBestAction.test.tsx`: renders action, timing, reason; offer title links to offer panel; "Do it" calls `openChannel(channel, …)`; no channel → no button
- [x] T028 [US2] Implement `components/leads/ai/NextBestAction.tsx` (uses F14 `openChannel`, stubbed via `deps.ts` until merged)
- [x] T029 [US2] Wire `NextBestAction` into `AiAssistCard.tsx`

## Phase 6: User Story 3 — Draft message (P1)

**Independent test**: Italian WhatsApp customer gets an Italian ≤ 600 char draft; Email adds a subject; Use draft opens the deep link and prefills the composer with `aiAssisted: true`.

- [x] T030 [P] [US3] Write failing tests `tests/unit/ai/draft.test.ts`: language = customer language, WhatsApp/SMS no subject ≤ 600, Email subject ≤ 120 and body ≤ 1000, first name addressed, offer mentioned only if matched, draft cache keyed by channel
- [x] T031 [US3] Make T030 pass in `services/ai/index.ts` / `generate.ts` (draft path)
- [x] T032 [P] [US3] Write failing component test `tests/unit/ai/DraftPanel.test.tsx`: channel select defaults to preferred, textarea editable, "Use draft" calls `openChannel(channel, text)` and the F06 composer prefill API with type = channel, note = text (edited or not) and `aiAssisted: true`; "Template in English" notice; disabled for closed leads
- [x] T033 [US3] Implement `components/leads/ai/DraftPanel.tsx` and wire into `AiAssistCard.tsx`
- [x] T034 [US3] Confirm the F06 activity create contract accepts `aiAssisted` (already in `CreateActivitySchema`); if the composer prefill API is not merged yet, record it under "Requires other-feature changes" in the report

## Phase 7: User Story 5 — Transparency & control (P2)

**Independent test**: AI output shows the label, regenerate, feedback; timeline chip on AI-assisted activities.

- [x] T035 [P] [US5] Implement `components/leads/ai/FeedbackButtons.tsx` (👍/👎 → POST feedback, keyboard accessible) and the ↻ Regenerate button in `AiAssistCard.tsx` with "AI-generated · check before sending" text
- [x] T036 [US5] Verify the F05 timeline renders the "✨ AI-assisted" chip for `ai_assisted` activities (F05 owns it; if absent, log a contract request in the report rather than editing F05 files)

## Phase 8: E2E, eval and polish

- [x] T037 Playwright `tests/e2e/ai-assist.spec.ts` (use `PORT`): no key → card shows "Rule-based" badge; Use draft → composer prefilled → saved activity shows the AI-assisted chip; ≤ 3 clicks from lead open to WhatsApp draft sent (SC-006)
- [x] T038 [P] Create eval script `server/services/ai/eval/run.ts` + golden set of 10 leads (`npm run eval:ai`, manual, needs a key): checks schema validity, language match, offer validity, reason mentions a real signal; prints a table plus p50/p95 latency and average token cost per generation (tracks SC-001, SC-005)
- [x] T039 [P] Verify logging discipline: a test asserting log output never contains prompt/completion text or seeded PII
- [x] T040 Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e`; walk through `quickstart.md`

## Dependencies & Order

- Phase 1 → Phase 2 → Phase 3 (US4 rules/route baseline) → Phases 4, 5, 6 (US1/US2/US3, mostly independent; share `AiAssistCard.tsx`, so sequence its edits) → Phase 7 → Phase 8.
- Tests in each phase precede their implementation tasks.
- Parallel: T002/T003; T004–T006; T010; T013/T015/T017/T020; T025; T027; T030/T032; T038/T039.

## Implementation Strategy

MVP = Phases 1–4: the rule-based baseline plus summary, always working with no key. Then add next best action, draft, transparency, e2e and eval.
