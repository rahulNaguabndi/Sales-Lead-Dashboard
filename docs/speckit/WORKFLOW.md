# Driving the Build with GitHub Spec Kit + Claude Code

The strategy: **specs are written sequentially, implementation runs in parallel by wave.**
Writing specs, plans and tasks is cheap and touches only docs. Doing it in one session keeps Spec Kit's feature numbering and branches clean. Implementation is the expensive part, so that's what gets split across parallel Claude sessions in git worktrees.

> Tested with specify-cli 1.0.14. The agent flag is `--integration` (older versions used `--ai`). The Claude integration installs **skills** by default, so commands may appear as `/speckit-specify` rather than `/speckit.specify`. Type `/speckit` in Claude Code to see the exact names, and read `/speckit.x` below as whichever form your install uses.

## 0. One-time Setup
```powershell
# from the repo root (git is already initialized). Confirm the merge prompt (only adds .specify/ and .claude/)
specify init --here --integration claude --script ps
git add -A; git commit -m "chore: initialize Spec Kit"
```
Then in Claude Code:
```
/speckit.constitution  <paste the contents of docs/speckit/constitution.md>
```
Commit the generated `.specify/memory/constitution.md`.

## 1. Phase A: Specify, Plan and Task Every Feature (sequential, one session)
Go in **wave order**: F01 → F02, F03, F09, F13 → F04, F05, F06, F10 → F07, F08, F11, F12, F14, F15 → F16, F17, F18, F19, F20.

For each feature `Fxx`:
```
/speckit.specify  <paste section 12 "/speckit.specify" prompt from docs/features/Fxx-*.md>
                  Authoritative detailed spec: docs/features/Fxx-*.md. Include ALL of its user stories,
                  FRs, edge cases and success criteria. Name the feature "Fxx <name>".
/speckit.clarify  (answer from the Fxx doc; anything truly open goes to the user)
/speckit.plan     <paste section 12 "/speckit.plan" prompt> Also follow docs/04-architecture.md and
                  the owned paths for Fxx in docs/features/README.md.
/speckit.tasks
/speckit.analyze  (cross-checks spec/plan/tasks against the constitution)
```
Commit on the feature branch, then merge the **docs-only** branch back to `main` so later specs can reference earlier ones:
```powershell
git add -A; git commit -m "spec(Fxx): specification, plan and tasks"
git checkout main; git merge --no-ff <NNN-fxx-branch>
```
Spec Kit numbers features automatically (`001`, `002`…). Keep a mapping in `docs/speckit/MAPPING.md` (for example `004 ↔ F04`). Specifying in wave order keeps the numbers close to the F-IDs.

## 2. Phase B: Implement in Parallel by Wave
For each wave, create one worktree per feature from the latest `main`:
```powershell
git worktree add ..\ld-F02 <NNN-f02-branch>
git worktree add ..\ld-F03 <NNN-f03-branch>
git worktree add ..\ld-F09 <NNN-f09-branch>
git worktree add ..\ld-F13 <NNN-f13-branch>
```
Start a Claude Code session in each worktree and run:
```
/speckit.implement
Constraints: stay inside the owned paths for this feature (docs/features/README.md).
Shared files are append-only. Tests first for pure logic. Stop and report if a schema
change seems necessary (the schema is owned by F01).
```
Each worktree needs its own `npm install`. SQLite files are per worktree. Redis can be shared (keys are namespaced), or set `REDIS_URL=redis://localhost:6379/<db-number>` per worktree for isolation.

### Merging a wave
1. Merge each finished branch into `main` one by one (`git merge --no-ff`). Resolve conflicts in shared, append-only files by keeping both sides.
2. On `main`: `npm install; npm run db:reset; npm run typecheck; npm run lint; npm test; npm run test:e2e`.
3. Check the **wave gate** (`docs/features/README.md`). Only then create the next wave's worktrees from the updated `main`.
4. Clean up: `git worktree remove ..\ld-F02`.

## 3. Recommended Parallelism
| Wave | Sessions | Notes |
|---|---|---|
| 0 | 1 (F01) | Everything depends on it, so review it carefully |
| 1 | 4 | F02, F03, F09, F13 are independent |
| 2 | 4 | F04, F05, F06, F10. **Checkpoint: R1–R3 demoable, tag `v0.1-mandatory`** |
| 3 | 6 | Run 3–4 at a time if review bandwidth is limited |
| 4 | 5 | F20 is decision-pending. Settle the caching discussion before implementing it |

## 4. Deadline Fallback (demo due today)
If time is short, implement only: **F01 → (F02, F03, F09, F13) → (F04, F05, F06, F10) → F12**. That's every mandatory requirement plus the live showroom-to-inbox moment. Everything else is covered in the architecture doc and video as the roadmap.

## 5. Review Checklist per Merge
- [ ] Acceptance scenarios in `docs/features/Fxx` pass (manually or in e2e)
- [ ] RBAC tests exist for new endpoints
- [ ] No edits outside the owned paths (except append-only shared files)
- [ ] No schema change without a migration plus a domain-model doc update
- [ ] The R1–R3 e2e test is still green
- [ ] Works with Redis stopped (degraded mode)
