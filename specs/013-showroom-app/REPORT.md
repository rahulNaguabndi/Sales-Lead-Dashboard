# F13 Build Report
Status: DONE
Branch: 013-showroom-app · Commits: 5 (spec, foundation, UI, report, plus earlier spec report)

## Acceptance scenarios
| Story/Scenario | Result | Evidence |
|---|---|---|
| US1 Browse and enquire (hero, 6 cards, filters, sheet, thank-you with reference) | ✅ | `Home.test.tsx`, `Enquiry.flow.test.tsx` (mock mode) |
| US2 Contact preferences (channel tiles, dependent required fields, country → dial/language) | ✅ | `Enquiry.flow.test.tsx` "ChannelTiles…" |
| US3 Validation and errors (inline, server 400 fields, retry with same Idempotency-Key, 429/413/401/5xx, draft kept) | ✅ | `Enquiry.flow.test.tsx` "errors", `errors.test.ts`, `intake-client.test.ts` |
| US4 Demo toolbar (source, prefill, burst ×5, hide flag) | ✅ | `DemoToolbar.test.tsx`, `sources/prefill/burst.test.ts` |
| US5 Model detail | ✅ | `ModelDetail.test.tsx` |
| Showroom → inbox within 2 s (SC, FR-016 CORS/idempotency) | 🟡 | `e2e/showroom-to-inbox.e2e.ts` authored, auto-skips when intake API is unreachable; not run (F10/F12 not on this branch) |
| Accessibility (FR-017) | 🟡 | Label/role queries in tests; Lighthouse ≥ 95 not measured |
| Bundle < 250 KB gz | ✅ | main chunk 77 KB gz; faker in a separate lazy chunk |

## Checks
typecheck: pass · lint: pass · unit: 54/54 (apps/showroom) · e2e: n/a (authored, skipped without intake API)

## Assumptions made (see assumptions.md)
Honeypot 202 → generic thank-you; 415/unknown status → server-error banner; budget range bounds; idempotency key lifetime.

## Deviations from spec
- Plain CSS (`styles.css`) instead of Tailwind: the F01 scaffold has no Tailwind, and adding it would touch shared config.
- No react-hook-form / @hookform/resolvers: a controlled form validated by `validateEnquiry` (shared `IntakeLeadSchema`) was simpler. Those two deps were removed from the plan.

## Requires F01 / other-feature changes
- F10 must implement FR-016 (CORS for `SHOWROOM_ORIGIN`, idempotency-key replay) and `GET /api/health` (used by the e2e probe).
- Append-only edits outside owned paths: `apps/showroom/package.json` (deps, `test` script), `vite.config.ts` (Vitest block), `tsconfig.json` (test types).
- Root `vitest.config.ts` does not include `apps/showroom`; showroom tests run via `npm test -w apps/showroom`. The e2e file is not under the root Playwright `testDir`.
- Local `apps/showroom/.env` (ignored) still has the old `VITE_API_*` names; defaults in `lib/env.ts` cover it.

## Known issues / follow-ups
- Lighthouse score and quickstart walkthrough were not run against a live browser.
- No RBAC tests: the showroom has no lead-scoped endpoints.
