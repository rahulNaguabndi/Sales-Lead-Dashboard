# F05 Build Report
Status: DONE
Branch: 005-lead-detail-timeline · Commits: 5 (spec, services, UI, e2e, report)

## Acceptance scenarios
| Story/Scenario | Result | Evidence |
|---|---|---|
| US-1 Lead details (header, cards, history, first enquiry) | ✅ | lead-detail.service.test.ts; e2e lead-detail.spec.ts |
| US-2 Chronological timeline (both orders, filter, paging, SC-002) | ✅ | lead-detail.service.test.ts (ordering, paging 120 items, kind filter); e2e order toggle + persistence |
| US-3 Access control (404 parity, 401, malformed id, log) | ✅ | lead-detail.rbac.test.ts; e2e out-of-scope deep link → 404 page |
| US-4 Slots | ✅ | DetailLayout.test.ts |
| US-5 Score popover | 🟡 | Reuses F09's ScoreBadge popover (reasoning/typecheck, not clicked in e2e) |
| US-6 Responsive tabs < 1024 px | 🟡 | CSS/tab-state implementation, not browser-verified at small width |
| Read-only claim prompt | ✅ | DetailLayout.test.ts |
| SC-001 timing (<150 ms seed-scale) | ✅ | coarse check in lead-detail.service.test.ts |
| FR-014 viewing is read-only | ✅ | lead-detail.service.test.ts |

## Checks
typecheck: pass · lint: pass · unit/integration: 237/237 · e2e: 5/5 (lead-detail + shell specs; PORT=3105, own DB)

## Assumptions made (see assumptions.md)
Four self-answered clarifications (no view logging, read-only claim prompt, score labels without F09, per-browser order preference).

## Deviations from spec
- No TanStack Query (not installed): plain fetch + state, same endpoints and cursor paging.
- No `loading.tsx` so the not-found page returns HTTP 404.
- Day grouping uses UTC.
- `vitest.config.ts`: added `esbuild: { jsx: 'automatic' }` so component tests render (additive, shared file).
- `e2e/shell.spec.ts`: replaced the F01 "501 stub" assertion with a 404 assertion now the route is live.
- T037 skipped: `tests/e2e/core-loop.spec.ts` does not exist.

## Requires F01 / other-feature changes
None. Soft deps coded against interfaces: F04 RelativeTime (local `components/timeline/RelativeTime.tsx` provided), F09 score badge (present and reused).

## Known issues / follow-ups
- Computing `permissions` calls `can()` for assign/claim/write; denials of mutation actions emit F03 "authorization denied" warn lines on each page view (noise, not a real denial). Consider a non-logging probe in F03.
- Customer detail `canView` calls `can()` per previous lead (N small per customer).
