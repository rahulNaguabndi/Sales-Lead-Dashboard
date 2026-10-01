# Video Script: EuroDrive Lead Desk (target 8–9 minutes)

> A speaking script plus a click-by-click demo plan. Lines in *italics* are what to say; bullets are what to show. Adapt the wording to your own voice, since reading verbatim sounds stiff.

## Before Recording (checklist)
- [ ] `docker compose up -d redis` · `npm run db:reset` (fresh deterministic data) · `npm run dev`
- [ ] Browser window 1: http://localhost:3000/login, zoom 110–125% so text is readable on video
- [ ] Browser window 2: http://localhost:3001 (the showroom), placed side by side with window 1 for the live-lead moment
- [ ] A terminal with `npm test` already run, so you can show the green summary (1,236 tests) without waiting
- [ ] Open in tabs: `docs/SYSTEM-DESIGN.md` (rendered on GitHub or in VS Code preview, so the Mermaid diagrams render) and `docs/features/README.md`
- [ ] Optional: set `ANTHROPIC_API_KEY` in `apps/web/.env` for live AI drafts; otherwise mention the rule-based fallback
- [ ] Close notifications and hide bookmarks

---

## 1. Introduction (0:00 – 0:45)
*"Hi, I'm Rahul Nagubandi. For this challenge I picked the **Sales Lead Management** scenario. I built 'EuroDrive Lead Desk' for a fictional European car dealership group.*

*The problem: leads arrive from the website, social ads, portals, phone and walk-ins, and they end up scattered. Reps miss follow-ups, managers can't see workload, and leadership can't see the funnel.*

*The three mandatory requirements are a lead inbox, a lead detail view with a chronological activity log, and persisted activity logging. I chose the **backend** as my primary layer: a REST API on a persistent database. I also built a real frontend so I can demo the full experience."*

- Show: the README top section (deliverables table and R1–R3 table).

## 2. System Design (0:45 – 2:45)
*"Here's the architecture."* (Show the diagram in §2 of SYSTEM-DESIGN.md.)

- **Components (about 40 s):** *"It's a TypeScript monorepo. The Next.js app holds both the UI and the REST API, 38 route handlers in total. Every request follows the same layering: authenticate, validate with Zod, call `authorize()`, then a service, then a repository. Services never touch Next.js, so the core could become a standalone service. SQLite in WAL mode is the database, Redis handles pub/sub, caching, token revocation and rate limits, and there's a separate showroom app that posts leads through a public, API-key-protected intake endpoint, just like a real dealer website would."*
- **Data flow (about 40 s):** Show the §5.1 sequence diagram. *"When a buyer submits on the showroom, intake validates, dedupes the customer, scores the lead, routes it to a team and auto-assigns it, all in one transaction. Then it publishes an event to Redis. The SSE endpoint filters that event by each viewer's permissions and pushes it to the browser, so the lead appears in the right inbox in under two seconds."*
- **Key decisions (about 40 s):** *"A few decisions I'd defend:*
  - *Activities and the audit log are append-only, enforced by **database triggers**, not just convention.*
  - *Every lead endpoint calls `authorize()`, and list and detail share one scope query, so they can't disagree.*
  - *Graceful degradation: if Redis dies, it falls back to in-process events; if Claude is unavailable, AI assist falls back to deterministic rules. The app never hard-fails on an external service.*
  - *SQLite keeps it zero-ops for now; Drizzle makes Postgres a driver swap when we scale."*
- **Observability (about 20 s):** Show §8. *"Today: structured JSON logs with no PII by design, request ids on errors, dependency-health logs, job logs and a full audit trail. For production I've laid out RED metrics, business metrics like time to first contact, and OpenTelemetry tracing from showroom submit through to the inbox toast."*

## 3. Implementation Highlights (2:45 – 3:45)
- Show `apps/web/server/` in the editor: `policy/`, `services/`, `db/`.
- Open `server/services/activity.ts` and point at the transaction: *"Logging an activity is one transaction: the activity row, an optional follow-up, an optional stage change validated by the shared state machine with an optimistic version check, a re-score and an audit row. It's idempotent by a client request id, so double-clicks and retries never create duplicates."*
- Open `server/db/migrations/0001_append_only.sql`: *"Here are the triggers that make history immutable."*
- Show the terminal with the `npm test` summary: *"1,236 unit and integration tests across 112 files, plus 16 Playwright end-to-end specs. Integration tests hit real route handlers against a real SQLite file, not mocks."*

## 4. AI Collaboration Story (3:45 – 5:30)
*"Now how I worked with AI, which is really the core of this role.*

*My strategy was **spec first**. Before writing any code I used Claude Code to produce the full spec: personas, user flows, the domain model, an architecture with ADRs, and 20 feature specs."* (Show `docs/features/README.md`.)

*"The key design move was to make the work **parallelizable for AI**. I split the features into five dependency waves and gave each feature an explicit list of files it owns. Shared files only allow append-only registrations, like this slot registry on the lead page. That meant I could run several Claude sessions in parallel, each in its own git worktree, without them colliding.*

*I automated that with GitHub Spec Kit and two custom skills: one takes a feature from spec to plan to tasks to implementation to verification, and one integrates a wave, runs every check and only proceeds if the gate passes.*

*How did I verify it? Gates, not trust. Lint with zero warnings, strict typecheck, unit and e2e tests all had to be green to merge a wave, and every session wrote a build report I reviewed.*

*But the most valuable lesson came at the end. All the tests were green, so I had Claude drive the real UI in a browser as each persona, rep, manager and VP, and write a severity-ranked audit. It found an **RBAC regression**: reps could list their whole team's leads. It also found a board that silently showed only 50 leads, and a timeline that didn't refresh after saving. Green tests didn't catch any of those, and walking through it as a user did. I fixed them and added a test for the RBAC rule.*

*Where I overrode the AI: it wanted to pick a caching strategy early, and I deliberately deferred it. It would have built real WhatsApp integration, and I scoped that to deep links behind an adapter interface."*

## 5. Live Demo (5:30 – 8:15)
**a. Rep: the mandatory core loop (about 75 s)**
1. Log in as **Sofia (Rep)** using the persona button. *"Role-based home: reps land on their inbox."*
2. **Inbox (R1):** point out the priority ranking, score badges, SLA and going-cold indicators, filters and search. Type a name in search.
3. Open a lead. **Detail (R2):** customer profile, preferred channel and best time, the score breakdown ("why is this hot?"), matching offers, and the **chronological timeline**.
4. **Log an activity (R3):** type Call, outcome Connected, a note, and schedule a follow-up for tomorrow, then Save. *"It appears in the timeline immediately."* Press **F5**: *"and it's persisted."*
5. Optional, 15 s: click **AI Assist**, then "Draft message". *"It drafts in the customer's language and channel. No email or phone is ever sent to the model."*

**b. Live lead from the showroom (about 40 s)**
1. Log out and log in as **Lukas (Manager, DACH)**. Put the showroom window beside it.
2. Fill in the showroom form with a German customer and submit. *"Watch the inbox."* A toast appears and the row highlights. *"It was scored, routed to DACH and auto-assigned, with no refresh."*
3. Alternatively, run `npm run simulate -- --count 3` in the terminal.

**c. Manager tools (about 30 s)**
- Pipeline kanban: drag a lead from Contacted to Qualified. Marking it Lost asks for a reason.
- Assign or claim a lead. Show team settings (auto-assign strategy).

**d. VP view (about 25 s)**
- Log in as **Isabelle (VP)**. Dashboard: funnel, conversion, sources, response times, team comparison, leaderboard, demographics.
- **Audit log:** open an entry and show the before/after diff. *"Every mutation is traceable and can't be edited."*

## 6. Learnings and Challenges (8:15 – 9:15)
- *"**Specs are the leverage point.** AI writes code fast; the expensive mistakes are about what to build. Time spent on specs paid off many times over."*
- *"**Design for AI parallelism.** File ownership and append-only extension points are what made parallel agents work. Without them, merge conflicts would have eaten the gains."*
- *"**Tests prove contracts, not experiences.** The persona walkthrough found cross-feature issues like inconsistent labels, counts that disagreed and stale UI after writes. Next time I'd run it after every wave, not at the end."*
- *"**Technical challenges:** e2e flakiness from typing before React hydration, which I solved by waiting on hydration rather than adding sleeps; keeping list and detail authorization consistent; and making the app keep working when Redis or the AI API is down."*
- *"**Next steps:** Postgres and horizontal scaling, OpenTelemetry metrics and tracing, real messaging adapters, ML scoring trained on won/lost outcomes, and GDPR tooling for the EU market.*

*Thanks for watching."*

---

### Timing Summary
| Section | Time |
|---|---|
| Intro | 0:45 |
| System design | 2:00 |
| Implementation highlights | 1:00 |
| AI collaboration | 1:45 |
| Demo | 2:45 |
| Learnings | 1:00 |
| **Total** | **≈ 9:15** (cut demo step 5a.5 or 5c to land near 8:00) |
