# F18 Build Report
Status: DONE
Branch: 018-ai-assist · Commits: 8

## Acceptance scenarios
| Story/Scenario | Result | Evidence |
|---|---|---|
| US1 Summary (≤600 chars, cached, regenerates on new activity) | ✅ | tests/unit/ai/generate.test.ts (service), e2e ai-assist |
| US2 Next best action + "Do it" prefill | 🟡 | rules.test.ts (all 8 rules), e2e shows NBA card; "Do it" uses F06 composer prefill |
| US3 Draft (language, limits, Use draft → composer, aiAssisted) | ✅/🟡 | validate/generate/rules tests; e2e Use draft prefills composer |
| US4 Rule-based fallback, no key / Redis down | ✅ | routes.rbac.test.ts (all seeded leads RULES), generate.test.ts error mapping |
| US5 Transparency (badge, regenerate, feedback, timeline chip) | 🟡 | SourceBadge, FeedbackButtons; F05 timeline already renders chip |
| RBAC (REP/MANAGER/VP, out-of-scope, 404, 400, closed 409) | ✅ | routes.rbac.test.ts |
| PII never in context/prompt (SC-003) | ✅ | routes.rbac.test.ts over all seeded leads, scrub.test.ts |

## Checks
typecheck: pass · lint: pass · unit: 1138/1138 · e2e: ai-assist 1/1 (PORT=3118; other specs not re-run)

## Assumptions made (see assumptions.md)
Plus: structured-output schemas use `zod/v4` (bundled in zod 3.25) because the SDK helper requires v4.

## Deviations from spec
/ai/feedback endpoint and 409 LEAD_CLOSED (already documented in F18 doc §9). Out-of-scope leads return 403/404 per the shared policy layer. Component tests (.tsx) were replaced by e2e because vitest only includes `.test.ts`.

## Requires F01 / other-feature changes
None. Offer link in NextBestAction is a `#offers` anchor without the title lookup (offer title not yet passed to the card).

## Known issues / follow-ups
- Live model path (real ANTHROPIC_API_KEY) is only verified via mocked SDK; run `npm run eval:ai -w apps/web` with a key.
- e2e needs a migrated+seeded DB (`npm run db:migrate && npm run db:seed`).
