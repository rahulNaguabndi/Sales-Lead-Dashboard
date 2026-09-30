# Wave 2 integration report

## Branches
| Branch | Report status | Result |
|---|---|---|
| 004-lead-inbox | DONE | merged clean |
| 005-lead-detail-timeline | DONE | merged clean |
| 006-activity-logging | PARTIAL (composer UI could not be exercised without F05/F04) | merged, 2 conflicts resolved |
| 010-lead-intake-routing | DONE | merged clean |

## Conflicts
- `apps/web/components/leads/detail/slots.tsx` (add/add): F05 owns it, so its version won. Re-applied F06's `composer: ActivityComposer` entry.
- `apps/web/e2e/core-loop.spec.ts` (add/add): kept F04's inbox-to-detail test and appended F06's R3 API and UI tests, with imports de-duplicated.

## Integration fixes
- The detail DTO lacked `lead.version`, which the F06 composer needs. Added it to `lead-detail.ts`, `types.ts` and the DetailLayout test fixture.
- The F05 claim-prompt test now expects the composer's read-only note text.
- The core-loop e2e now asserts the inbox row for the logged lead shows "Called · now", matching the real label and relative-time format.

## Checks
- npm install, db:reset: ✅
- typecheck: ✅
- lint: ✅
- npm test: ✅ 58 files, 545 tests
- test:e2e: ✅ 23 passed

## Gate
- ✅ R1 inbox: inbox.spec and core-loop
- ✅ R2 detail and timeline: lead-detail.spec, core-loop opens a lead
- ✅ R3 activity logging persists: core-loop API and UI, including reload and inbox "Called · now"
- ✅ Intake API creates and assigns leads: intake.spec, intake-pipeline and intake-http tests

## Follow-ups
- F06 UI items (stage select 409 flow, optimistic saving) are covered only lightly in a browser.
- F05 responsive tabs below 1024 px are not browser-verified.
