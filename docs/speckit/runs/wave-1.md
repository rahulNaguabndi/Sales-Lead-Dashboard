# Wave 1 integration report

## Branches
All four reports have status SPECCED (spec/plan/tasks only, no implementation). The skill merges only DONE/PARTIAL, so all were skipped:
- 002-authentication: SPECCED, skipped (US-1..US-5 not built)
- 003-hierarchy-rbac: SPECCED, skipped
- 009-lead-scoring: SPECCED, skipped
- 013-showroom-app: SPECCED, skipped

## Conflicts
None (nothing merged).

## Checks
Not run; main is unchanged since wave 0.

## Gate
- ❌ Login works (F02 not built)
- ❌ `scopeFor(user)` tested (F03 not built)
- ❌ `scoreLead()` tested (F09 not built)
- ❌ Showroom form validates against shared contract (F13 not built)

## Follow-ups
Re-run build-feature with implementation for F02, F03, F09, F13 (tasks.md exists on each branch), then re-run integrate-wave 1. No tag `wave-1-done` created.
