# 00 — Product Overview: EuroDrive Lead Desk

> Sales Lead Management Tool · Domain: Demand · Owner: Rahul Nagubandi · Version 1.0 (spec baseline) · 2026-09-30
> This folder is the **single source of truth** for building the product. `PLAN.md` at the repo root is the earlier draft, and this folder supersedes it.

## 1. Document Map
| Doc | Purpose |
|---|---|
| `00-overview.md` | Vision, scope, priorities, global decisions, glossary *(this file)* |
| `01-personas.md` | Personas, jobs-to-be-done, permissions |
| `02-user-flows.md` | End-to-end flows (Mermaid diagrams) |
| `03-domain-model.md` | Entities, state machines, data model, enums, event catalog |
| `04-architecture.md` | System architecture, tech stack, repo layout, ADRs, NFRs |
| `features/README.md` | Feature index, dependency graph, parallel build waves |
| `features/F01…F20-*.md` | One spec per feature: stories, requirements, decisions, technical plan input |
| `features/_TEMPLATE.md` | Template every feature spec follows |
| `speckit/constitution.md` | Input for `/speckit.constitution` |
| `speckit/WORKFLOW.md` | How to drive GitHub Spec Kit + Claude with these docs |

## 2. Problem Statement
Leads reach "EuroDrive Motors", a fictional multi-country European car dealership group, through its website, social ads, portals, phone and walk-ins. Today they're scattered across inboxes and spreadsheets. Salespeople miss follow-ups, respond slowly, ignore customer channel preferences, and don't know which offers apply. Managers and VPs can't see coverage, response times, or conversion.

## 3. Vision
A lightweight, fast, data-dense **lead desk**:
- **Reps** always know *which lead to work next and how* (channel, offer, suggested message).
- **Managers** can see and steer their team's workload in real time.
- **VPs** get a trustworthy org-wide view of the funnel and revenue.

## 4. Challenge Requirements (mandatory, non-negotiable)
| ID | Requirement | Covered by |
|---|---|---|
| **R1** | Lead Inbox: list all incoming leads | F04 |
| **R2** | Lead Details View: full details plus a chronological log of follow-up activities | F05 |
| **R3** | Activity Logging: log a new follow-up activity, persisted | F06 |

## 5. Scope & Priority Tiers
| Tier | Meaning | Features |
|---|---|---|
| **P0** | Demo fails without it | F01 Foundation, F02 Auth, F03 Hierarchy/RBAC, F04 Inbox, F05 Detail, F06 Activity |
| **P1** | The differentiators | F07 Stages, F08 Follow-ups/Cold, F09 Scoring, F10 Intake/Routing, F11 Assignment, F12 Live Updates, F13 Showroom App, F14 Customer & Channels, F15 Offers, F16 Dashboards, F18 AI Assist, F20 Caching |
| **P2** | Polish | F17 Demographics, F19 Audit Log UI |

### Non-goals (v1)
- Real outbound WhatsApp, SMS or email. We use deep links plus auto-logging, behind an adapter interface.
- Multi-tenant or multi-dealership SaaS.
- Production deployment. The target is local plus Docker Compose.
- Mobile-native apps. The web app is responsive down to tablet width.
- GDPR tooling (consent management, data export or erasure). **Noted as a real requirement for the EU market** and listed as future work.

## 6. Global Decisions Log
| # | Decision | Rationale |
|---|---|---|
| D1 | AI features in scope (Claude API) with a **deterministic rule-based fallback** | AI-native role; the demo must never break without a key or network |
| D2 | **3-level hierarchy: Rep → Manager → VP**, modeled as a tree (`manager_id`) | Supports N levels without schema change |
| D3 | **EU market**: EUR (€), European names, cities, phone formats, multi-language customers | Target market |
| D4 | Reps **claim** unassigned leads, managers **assign manually**, per-team **auto-assign** toggle with strategy | Flexibility across team styles |
| D5 | Transparent **rule-based lead score (0–100)** with explainable breakdown, plus priority bands | Explainable and demo-friendly; baseline for future ML |
| D6 | **Live inbox via Server-Sent Events** | One-way push is enough; simpler than WebSockets |
| D7 | **Showroom is a separate mini app** (own port) posting to the public intake API with an API key | Demonstrates a real external lead source and integration boundary |
| D8 | Fictional brand "EuroDrive Motors" with generic model names | No trademark issues |
| D9 | **Redis** added for caching, pub/sub (live events), token revocation and intake rate limiting. **Detailed caching strategy decided later (F20)** | Performance plus horizontal-scale readiness |
| D10 | **Monorepo (npm workspaces)**: `apps/web` (Next.js), `apps/showroom` (Vite React), `packages/shared` (contracts) | Shared types and contracts; parallel work streams |
| D11 | **Full DB schema and shared contracts owned by F01** | Parallel feature work doesn't collide on migrations or types |
| D12 | SQLite (WAL) via Drizzle ORM; Postgres is the documented scale path | Read-heavy, small data, zero ops |
| D13 | JWT (HS256) in an httpOnly cookie, bcrypt passwords, server-side policy RBAC | Secure, explainable, no auth vendor magic |
| D14 | Activities (and the audit log) are **append-only**, enforced by DB triggers | Traceability and trust in the timeline |

## 7. Success Criteria (product level)
- SC-1: A rep logs an activity in **≤ 3 clicks plus typing** from the inbox, and it's still there after a restart.
- SC-2: A lead submitted in the Showroom appears in the correct user's inbox in **< 2 seconds** without a refresh.
- SC-3: Inbox and lead-detail pages render in **< 300 ms** server time with seed data (800+ leads).
- SC-4: Every dashboard number can be traced to DB rows (no hard-coded metrics).
- SC-5: No user can read or modify a lead outside their visibility scope (verified by tests).
- SC-6: The app runs with `docker compose up -d redis && npm install && npm run db:reset && npm run dev`.

## 8. Glossary
| Term | Meaning |
|---|---|
| **Lead** | A single sales opportunity (one enquiry about buying a vehicle). Belongs to one customer. |
| **Customer** | A person. Can have many leads over time. Deduplicated by phone or email. |
| **Returning customer** | A customer with a previous lead or purchase. |
| **Activity** | An append-only timeline entry on a lead: user-logged (call, WhatsApp…) or system (stage change, assignment…). |
| **Stage** | Pipeline position: NEW, CONTACTED, QUALIFIED, TEST_DRIVE, NEGOTIATION, WON, LOST, COLD. |
| **Priority** | Band derived from score: HOT (≥ 70), WARM (40–69), COOL (< 40). Not the same as the COLD stage. |
| **Contact activity** | A USER activity whose type isn't `NOTE` (call, WhatsApp, SMS, email, meeting, test drive). Internal notes aren't customer contact. |
| **Coverage** | % of leads (in a period or scope) with ≥ 1 contact activity. |
| **First response time (FRT)** | Time from lead creation to its first contact activity. |
| **Scope** | The set of users whose leads a user can see: themselves plus all descendants in the hierarchy. |
| **Unassigned pool** | Leads routed to a team with no owner yet. |
| **Intake** | The pipeline that receives external leads: validate → dedupe → score → route → assign → broadcast. |
| **Deep link** | A URL that opens a channel app (`wa.me`, `tel:`, `sms:`, `mailto:`). |
| **SLA breach** | A NEW lead with no contact activity past its response target (HOT 15 min, others 2 h). |
