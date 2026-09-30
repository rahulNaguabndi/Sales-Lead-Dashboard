---
name: build-feature
description: Autonomously take one EuroDrive Lead Desk feature (F01–F20) through the full Spec Kit pipeline — specify, clarify (self-answered from docs), plan, tasks, analyze, implement, verify, commit — without asking the user anything. Use when asked to build/run a feature by ID, e.g. "build-feature F04".
argument-hint: <FeatureID e.g. F04> [spec-only]
---

# build-feature: unattended Spec Kit pipeline for one feature

Arguments: `$ARGUMENTS`. The first token is the feature ID (`Fxx`). If `spec-only` is present, stop after step 5.

You run **headless, and nobody is watching**. Never ask the user a question and never wait for input. When something is ambiguous, decide using the docs, record the decision, and keep going. If you're truly blocked, write a BLOCKED report (step 9) and stop cleanly.

## 0. Orient (read before doing anything)
1. Resolve the spec file `docs/features/Fxx-*.md`. Derive `NN` (the two digits of the ID), `NUM` = `0NN` (e.g. `004`), and `SLUG` = the file name without `Fxx-` and `.md` (e.g. `lead-inbox`).
2. Read in full: `docs/features/Fxx-*.md`, `docs/features/README.md` (wave, dependencies, **owned paths**, ownership exceptions), `.specify/memory/constitution.md` (fall back to `docs/speckit/constitution.md`), `docs/03-domain-model.md`, and `docs/04-architecture.md`. Skim `docs/00-overview.md`, `01-personas.md`, and `02-user-flows.md`.
3. Check that the dependencies listed in README are present on this branch (their code exists or `specs/0NN-*` exists). Same-wave soft dependencies are expected to be missing, so stub them as the README describes. If a **hard** dependency from an earlier wave is missing, write a BLOCKED report and stop.
4. **Resume:** if `specs/0NN-*/tasks.md` already exists and was committed, skip steps 1–5 and continue at step 6. In `spec-only` mode, just print `Fxx: SPECCED — already specified` and stop, without writing any files. If `specs/0NN-*/REPORT.md` says `Status: DONE`, just print the final message and stop.
5. Environment: respect the `PORT`, `SHOWROOM_PORT`, `REDIS_URL`, and `DATABASE_URL` env vars if set. Other features are being built **in parallel** on this machine, so never hardcode ports 3000/3001 in scripts or tests, and never kill processes you didn't start.

## 1. Specify
Invoke the `speckit-specify` skill with:
> Fxx <Feature name from the spec title>. Use feature number NUM and short name SLUG (pass `-Number NUM -ShortName SLUG` to the create-new-feature script). The authoritative source is docs/features/Fxx-*.md: carry over ALL of its user stories (with priorities), acceptance scenarios, functional requirements (keep the FR numbers), key entities, edge cases, and success criteria. Keep the spec tech-agnostic; the technical detail belongs in the plan.

Confirm that `specs/NUM-SLUG/spec.md` exists afterwards. If the script picked a different number, use whatever directory it created from here on.

## 2. Clarify (self-answered)
Invoke `speckit-clarify`. For every question it raises, answer it yourself, in this order of precedence:
Fxx spec → domain model / architecture → other feature specs → constitution → the **recommended** option.
Append every answer you had to infer to `specs/NUM-SLUG/assumptions.md` (question, answer, source or "inferred"). Items marked `[NEEDS CLARIFICATION]` in the Fxx doc get the doc's stated recommendation. **Exception:** if the feature is F20 (caching), stop after this step with a BLOCKED report listing Q1–Q7, because the product owner must decide those.

## 3. Plan
Invoke `speckit-plan` with:
> Follow section 9 "Technical Plan Input" of docs/features/Fxx-*.md, docs/04-architecture.md (layering, stack, Redis degradation, security), docs/03-domain-model.md (the schema is owned by F01; do not change it unless this IS F01), and restrict file changes to the owned paths for Fxx in docs/features/README.md, plus append-only edits to shared files. Record every new dependency with a one-line justification.

## 4. Tasks
Invoke `speckit-tasks`. Make sure the tasks put the tests for pure logic **before** their implementation, and include the RBAC tests and the e2e test that the spec calls for.

## 5. Analyze
Invoke `speckit-analyze`. Fix every CRITICAL and HIGH finding by editing spec, plan, or tasks, then re-run once. Commit:
`git add specs/ && git commit -m "spec(Fxx): specification, plan and tasks"`.
If the arguments contain `spec-only`, go to step 9 and use `Status: SPECCED` (fill in the spec-related sections only).

## 6. Implement
1. If `package.json` exists and `node_modules` doesn't, run `npm install`. If this is F01, the scaffold creates them, so run it after scaffolding.
2. Invoke `speckit-implement`. Guardrails while implementing:
   - **Stay inside the owned paths.** Shared files are append-only (new exports, nav entries, slot registrations). Never reformat or reorder other features' code.
   - **No schema changes** unless this is F01. If one seems unavoidable, don't make it. Implement a workaround or stub and log it under "Requires F01 change" in the report.
   - Unit-test pure logic first (red → green). Add RBAC tests for every new lead-scoped endpoint.
   - Graceful degradation: the code must work with Redis stopped and with no `ANTHROPIC_API_KEY`.
   - Commit after each completed task phase with messages like `feat(Fxx): <what>`. Small commits are easier to merge.

## 7. Verify
Run whatever of these exist, and fix failures that come from **your** feature (up to 3 fix cycles):
`npm run typecheck` · `npm run lint` · `npm test` · `npm run test:e2e` (only if Playwright is configured; use `PORT` for the server).
Then check each acceptance scenario in the Fxx doc and mark it ✅ (automated test), 🟡 (verified manually or by reasoning), or ❌.
Failures caused by *other* features' missing code are expected in parallel builds. Note them and don't "fix" code outside your owned paths.

## 8. Update the docs if behavior changed
If the implementation deliberately deviates from `docs/features/Fxx-*.md`, amend that doc in the same branch (Constitution I) and list the change in the report.

## 9. Report and final commit
Write `specs/NUM-SLUG/REPORT.md`:
```
# Fxx Build Report
Status: DONE | PARTIAL | BLOCKED | SPECCED
Branch: <git branch> · Commits: <n>
## Acceptance scenarios
| Story/Scenario | Result | Evidence (test name or note) |
## Checks
typecheck: pass/fail · lint: pass/fail · unit: x/y · e2e: x/y or n/a
## Assumptions made (see assumptions.md)
## Deviations from spec
## Requires F01 / other-feature changes
## Known issues / follow-ups
```
`git add -A && git commit -m "docs(Fxx): build report"`. Never push. Never merge into main. Never delete branches or worktrees.
Finish with a single final message: `Fxx: <Status> — <one-line summary>`.
