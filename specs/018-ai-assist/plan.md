# Implementation Plan: F18 AI Assist

**Branch**: `018-ai-assist` | **Date**: 2026-09-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/018-ai-assist/spec.md`; technical input from `docs/features/F18-ai-assist.md` §9.

## Summary

An AI Assist card on the lead detail page (F05 slot "ai") with summary, next best action and on-demand draft message. A server service under `server/services/ai/` builds a PII-scrubbed context, calls Claude via `client.messages.parse` with Zod structured output, post-validates, and caches by content fingerprint. Every failure mode ends in a deterministic, labelled rule-based result (`rules.ts`). Two thin route handlers (`suggest`, `draft`) authorize `lead:read` via F03. Nothing is persisted in the DB and nothing is auto-sent.

## Technical Context

**Language/Version**: TypeScript strict, Node ≥ 20, Next.js App Router (Node runtime)

**Primary Dependencies**: `@anthropic-ai/sdk` (new), `zod` (existing, shared), TanStack Query (existing), `ioredis` via F01 `server/redis` (existing)

**Storage**: none in DB. Redis `ai:{kind}:{leadId}:{fingerprint}` (TTL 86400) and `rl:ai:{userId}` (60-min window); in-memory LRU / counter fallback when Redis is degraded

**Testing**: Vitest (SDK mocked), Playwright e2e, manual `npm run eval:ai` (needs a key, costs money)

**Target Platform**: Windows/macOS/Linux dev, Node server

**Project Type**: web application (npm workspaces monorepo: `apps/web`)

**Performance Goals**: uncached suggest p50 ≤ 4 s / p95 ≤ 8 s; cached ≤ 200 ms

**Constraints**: SDK timeout 15 000 ms, `maxRetries: 1`, `max_tokens` 2000 (suggest) / 1500 (draft), 30 generations/user/hour, no PII in prompts or logs, no prompt/completion text logged

**Scale/Scope**: 2 endpoints, 1 card (5 components), ~8 service modules

## Constitution Check

| Principle | Status | Note |
|---|---|---|
| I Spec is truth | Pass | Doc F18 amended if behavior deviates |
| II R1–R3 first | Pass | Additive slot; failure of AI never blocks the page (skeleton, fallback) |
| III Layering | Pass | route → Zod → `authorize` → `services/ai` → read models (F05 `lead-detail`, F15 `matchOffers`); no SQL in services/ai (reads via existing services/repositories) |
| IV Security | Pass | `lead:read` authorize; PII scrubber; key from env only; output rendered as React-escaped text |
| V Test-first | Pass | scrubber, context, rules, validator, fingerprint tests precede implementation; RBAC tests REP/MANAGER/VP in/out of scope; Playwright journey |
| VI Integrity | Pass | No writes, no schema change; `aiAssisted` written by F06 |
| VII Degradation | Pass | No key / Redis down / timeout → rules, in-memory cache and limiter |
| VIII Simplicity | Pass | One new dependency (below) |
| IX Performance | Pass | Card loads async and never blocks the page; cache hit ≤ 200 ms |
| X UX | Pass | Loading, error(fallback), disabled states; badge has text + icon |

Post-design re-check: pass, no violations.

### New dependencies

| Package | Justification |
|---|---|
| `@anthropic-ai/sdk` | Official Claude client; provides `messages.parse` + `zodOutputFormat` structured outputs and typed errors (mandated by constitution tech constraints) |

## Project Structure

### Documentation (this feature)

```text
specs/018-ai-assist/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/ai-endpoints.md
├── assumptions.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (owned paths only)

```text
apps/web/
├── server/services/ai/
│   ├── context.ts        # buildLeadContext, scrubPII, budget banding
│   ├── prompts.ts        # PROMPT_VERSION, frozen SYSTEM_PROMPT, buildUserMessage (delimited sections)
│   ├── schemas.ts        # SuggestSchema, DraftSchema, response types
│   ├── client.ts         # lazy shared Anthropic client (timeout 15_000, maxRetries 1); null without credential
│   ├── generate.ts       # generateSuggest / generateDraft; stop_reason + typed error mapping
│   ├── validate.ts       # post-validation (offerId, language, length)
│   ├── rules.ts          # ruleSuggest / ruleDraft, templates en,de,fr,it,es,nl,pt × channel
│   ├── fingerprint.ts    # sha1(promptVersion, lead.version, last_activity_at, sorted offerIds, channel?)
│   ├── cache.ts          # getOrGenerate (Redis + single-flight + LRU), rate limiter
│   ├── index.ts          # suggestForLead / draftForLead orchestration + logging
│   └── eval/             # golden set + eval script entry (npm run eval:ai)
├── app/api/leads/[id]/ai/
│   ├── suggest/route.ts
│   ├── draft/route.ts
│   └── feedback/route.ts # logs 👍/👎 (leadId, kind, fingerprint)
├── components/leads/ai/
│   ├── AiAssistCard.tsx, NextBestAction.tsx, DraftPanel.tsx, SourceBadge.tsx, FeedbackButtons.tsx
│   └── use-ai.ts         # TanStack Query hooks
└── tests/
    ├── unit/ai/*.test.ts
    └── e2e/ai-assist.spec.ts
```

Append-only edits to shared files: `components/leads/detail/slots.tsx` (register AI card), `.env.example` (AI vars, already listed), `apps/web/package.json` (dependency + `eval:ai` script). Contract requests to other features: F06 accepts `aiAssisted`, F05 renders the chip, F14 exports `openChannel(channel, text)` and templates, F15 exports `matchOffers(leadId)`. Until merged, `services/ai` codes against these interfaces behind thin local stubs.

**Structure Decision**: confined to the F18 owned paths; no schema change.

## Complexity Tracking

No violations.
