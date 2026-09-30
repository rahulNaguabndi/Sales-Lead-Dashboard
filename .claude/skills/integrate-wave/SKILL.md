---
name: integrate-wave
description: Autonomously merge a finished EuroDrive build wave's feature branches into main, resolve conflicts, run all checks, verify the wave gate, and tag it. Use when asked to integrate/merge wave N, e.g. "integrate-wave 2 004-lead-inbox 005-lead-detail-timeline".
argument-hint: <wave number> <branch> [branch...]
---

# integrate-wave: merge and verify a wave (unattended)

Arguments: `$ARGUMENTS`. The first token is the wave number `N`, and the rest are the feature branches to merge. You run headless, so never ask questions. Work on `main` in the current directory.

## 1. Preflight
- `git status` must be clean and the current branch must be `main`. If the tree is dirty, commit it with `chore: pre-integration snapshot` (never discard anything).
- For each branch, read `specs/<branch>/REPORT.md` from that branch (`git show <branch>:specs/<branch>/REPORT.md`). Merge branches with status DONE or PARTIAL. **Skip BLOCKED** branches and record why.

## 2. Merge, one branch at a time (in the given order)
`git merge --no-ff <branch> -m "merge(<branch>): wave N"`
Resolve conflicts using these rules:
- **Append-only shared files** (nav/menu registries, `slots.tsx`, `packages/shared` index exports, `.env.example`, package.json scripts/deps): keep **both** sides and de-duplicate.
- `package-lock.json`: take either side, then run `npm install` to regenerate it after the merge.
- A file owned by one feature (see `docs/features/README.md`): the **owner's** version wins. Then re-apply any legitimate append-only additions from the other side.
- Same-wave **stubs** (F08→F07 `changeStage`, F07→F15 `matchOffers`, F04 `live-slot.ts` → F12, `seed/score-step.ts` → F09): the real implementation replaces the stub.
- Never resolve a conflict by deleting a feature's functionality. If a conflict is truly semantic and you can't resolve it safely, `git merge --abort`, record it, and continue with the next branch.

## 3. Verify on main
Run: `npm install` → `npm run db:reset` → `npm run typecheck` → `npm run lint` → `npm test` → `npm run test:e2e` (if configured).
Fix integration breakage (wrong imports, a stub not replaced, type drift between features) with minimal changes. You may touch any file for this, but only to integrate, never to add features. Up to 5 fix cycles. Commit with `fix(integration): <what>`.

## 4. Wave gate
Check the gate for wave N in `docs/features/README.md` ("Build Waves" table) and verify each item concretely (run the command, hit the endpoint with `curl`, or confirm a test covers it).
The R1–R3 end-to-end test must pass from wave 2 onwards.

## 5. Record the result
Write `docs/speckit/runs/wave-N.md`: the branches merged or skipped (with reasons), conflicts and how you resolved them, check results, the gate checklist with ✅/❌, and follow-ups. Commit with `docs: wave N integration report`.
- If the gate passes and all checks are green, run `git tag wave-N-done`.
- Otherwise don't tag it. The orchestrator stops when the tag is missing.

Never push. Finish with a single final message: `wave N: PASSED|FAILED — <one-line summary>`.
