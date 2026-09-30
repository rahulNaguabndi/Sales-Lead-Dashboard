# Sales Lead Management Tool — Product & Technical Plan

> ⚠️ **Superseded by [`docs/`](docs/00-overview.md).** This is the original brainstorm draft, kept for history.

> Status: DRAFT v0.2 · Domain: Demand · Owner: Rahul Nagubandi
> Purpose: Interview coding challenge. Build it end to end, run it locally, and demo it. Deliverables: working app, architecture document, demo video.
> **Deadline: end of day 2026-09-30.** Build the prototype first, then iterate.

---

## 0. Decisions Log (v0.2)

| #   | Decision                                                                                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **AI features are in scope.** Claude API with a rule-based fallback, so the app works with no API key.                                                                                          |
| D2  | **Three-level hierarchy: Sales Rep → Manager → VP.** Modeled as a `manager_id` tree, so it works for any depth.                                                                                 |
| D3  | **Market: Europe.** Currency **EUR (€)**, European names, cities, phone formats (+49, +33, +31, +39, +34 …), and languages.                                                                     |
| D4  | **Assignment:** reps can **claim** unassigned leads, managers can **manually assign**, and managers can turn **auto-assign** on or off per team.                                                |
| D5  | **Lead scoring and priority mechanism** defined in §4.14.                                                                                                                                       |
| D6  | **Live inbox:** Server-Sent Events push new leads and updates without a refresh.                                                                                                                |
| D7  | **Lead-generation demo site:** a public mock dealership website inside the same app (`/showroom`) whose enquiry form feeds the intake API, so the lead appears live in the inbox and dashboard. |
| D8  | Brand: fictional dealership **"EuroDrive Motors"** with generic model names (to avoid trademark issues).                                                                                        |

---

## 1. Goals & Scope

### 1.1 Mandatory requirements (these cannot slip)

| #   | Requirement           | Acceptance criteria                                                                                                                                                             |
| --- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **Lead Inbox**        | Lists every incoming lead with name, source, stage, owner, age, and last activity. You can sort, filter, and paginate it.                                                       |
| R2  | **Lead Details View** | Clicking a lead opens its full details and a **chronological activity timeline**.                                                                                               |
| R3  | **Activity Logging**  | A salesperson logs a follow-up (for example, "Called customer"). It is **saved to the DB**, shows up in the timeline right away, and is still there after a refresh or restart. |

### 1.2 Extended scope (what makes the demo stand out)

Auth and RBAC, a manager dashboard with analytics, multi-source lead funnels, customer contact preferences with channel deep links, returning-customer detection, active offers, a lead stage pipeline, follow-up scheduling and cold-lead detection, demographics analytics, and an audit trail.

### 1.3 Non-goals (v1)

- Real WhatsApp, SMS, or email sending. We use **deep links** (`wa.me`, `tel:`, `sms:`, `mailto:`) and auto-log the activity.
- Multi-tenant or multi-dealership setups.
- Production deployment. Local only, plus an optional Docker setup.

### 1.4 Priority tiers

- **P0**: R1–R3, login, seed data. _The demo is incomplete without these._
- **P1**: RBAC, manager dashboard, stage pipeline, follow-ups, preferences with deep links, offers.
- **P2**: Demographics analytics, audit log UI, AI summary / next-best-action, real-time updates.

Build P0 end to end first, then add layers. That way you always have something you can demo.

---

## 2. Assumption Check (corrections and confirmations)

| Assumption                 | Verdict                       | Notes                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Read-heavy"               | ✅ **Correct**                | Inbox, detail, and dashboard reads far outnumber writes. Writes are small and infrequent: log activity, change stage, reassign. Rough ratio is 20:1 or higher.                                                                                                                                                                                                                                                         |
| SQLite is enough           | ✅ **Correct for this scope** | Data is structured and relational, the dataset is small (thousands of rows), and it runs locally with zero ops. Turn on **WAL mode** so reads never block writes. Caveat: SQLite allows **one writer at a time**. That's fine for a handful of salespeople, but it doesn't scale out horizontally. Use an ORM so a switch to Postgres is a one-line config change. Put that in the architecture doc as the scale path. |
| No unstructured data       | ⚠️ **Mostly**                 | Activity notes are free text, and customer preferences and tags are semi-structured. Store them as `TEXT` / JSON columns. SQLite's JSON1 handles this. No need for a document DB.                                                                                                                                                                                                                                      |
| Need real chat integration | ❌ **Not for the demo**       | Deep links plus auto-logging give 90% of the value at 5% of the cost. Present real integrations (WhatsApp Business API, Twilio) as a **future adapter layer** in the architecture doc.                                                                                                                                                                                                                                 |
| Lightweight UI             | ✅                            | This is a data-dense internal tool, so aim for density rather than decoration. Budget pixels (see §7).                                                                                                                                                                                                                                                                                                                 |

---

## 3. Personas & Roles

| Persona                            | Role key  | Goal                                                                                                  | Key screens                                                     |
| ---------------------------------- | --------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **Sales Rep** (Priya)              | `REP`     | Work their assigned leads quickly, never miss a follow-up, and use each customer's preferred channel. | My Inbox, Lead Detail, Today's Follow-ups                       |
| **Sales Manager** (Lukas Becker)   | `MANAGER` | See team workload, coverage, and conversion. Assign and reassign leads, and spot neglected ones.      | Team Dashboard, Team Inbox, Rep drill-down, Assignment settings |
| **VP of Sales** (Isabelle Laurent) | `VP`      | Org-wide pipeline, revenue, and team-vs-team comparison. Manages offers.                              | Org Dashboard, Team comparison, Offers                          |

Reps are Sofia Rossi, Jan de Vries, Marta García, Émile Dubois, and others. They're split across **regional teams** (for example Team DACH, Team Benelux/France, Team South), and each rep lists the languages they speak.

**Hierarchy:** `users.manager_id` forms a tree (VP → Managers → Reps). A user's **visibility scope** is themselves plus all their descendants, resolved with a recursive CTE. The same code works if a fourth level (for example a Regional Director) is added later.

### 3.1 RBAC matrix

| Action                             | REP                                        | MANAGER                    | VP                                 |
| ---------------------------------- | ------------------------------------------ | -------------------------- | ---------------------------------- |
| View leads                         | Own plus the unassigned pool of their team | Their subtree (their team) | All (their subtree = org)          |
| View lead detail / timeline        | Own                                        | Team                       | All                                |
| Log activity                       | Own                                        | Team                       | All                                |
| Change stage                       | Own                                        | Team                       | All                                |
| Claim unassigned lead              | ✅ (subject to a claim limit)              | ✅                         | ✅                                 |
| Assign / reassign lead             | ❌                                         | Within their team          | Across teams                       |
| Toggle auto-assign / pick strategy | ❌                                         | Their team                 | Any team                           |
| Dashboard                          | Personal stats                             | Team dashboard             | Org dashboard plus team comparison |
| Manage offers                      | ❌                                         | ❌                         | ✅                                 |

Enforce this **on the server** in a single `authorize(user, action, resource)` policy function that uses the scope set. Hiding UI elements is only cosmetic.

---

## 4. Feature Specification

### 4.1 Authentication (P0)

- Email and password login. Passwords are hashed with **bcrypt** (cost 10).
- On success, the server issues a **signed JWT** (HS256, 8h expiry) in an **httpOnly, SameSite=Lax cookie**. The token is never in localStorage, which protects it from XSS.
- JWT claims: `sub` (userId), `role`, `teamId`, `name`, `exp`.
- Middleware verifies the JWT on every protected route and API call. An expired or invalid token redirects to `/login`.
- Logout clears the cookie.
- Seeded demo users with a one-click "Login as Rep / Manager" button on the login page, which makes the demo much smoother.
- _Architecture doc talking point:_ the refresh-token and revocation strategy (a `sessions` table or token version) is a documented next step.

### 4.2 Lead Inbox (P0, R1)

- A dense table/list. Columns: priority dot, name, vehicle of interest, source badge, stage chip, owner avatar, lead age ("2h", "3d"), last activity, next follow-up (red if overdue).
- **Filters:** stage, source, owner (manager only), date range, "overdue follow-ups", "new/untouched", "returning customer".
- **Search:** name, phone, email.
- **Sort:** newest (default), oldest untouched, next follow-up, lead score.
- **Pagination:** server-side, 25 per page.
- **Saved quick views (tabs):** `My Leads` · `Unassigned` · `Due Today` · `Going Cold` · `All (manager)`.
- An unread/untouched indicator for leads with no activity yet.

### 4.3 Lead Details View (P0, R2)

Split layout: **left = context, center = timeline, right = actions**.

- **Header:** customer name, stage (editable dropdown), owner (reassignable by manager), lead score, source, created date, a "Returning customer" badge.
- **Customer card:** phone, email, age band, city, **preferred channel** (★ marked), best time to contact, language.
- **Interest card:** vehicle model, budget range, trade-in yes/no, finance interest, test-drive requested.
- **History card (returning customers):** past purchases, past leads, service visits.
- **Applicable offers panel:** active offers matched to this lead (see 4.8).
- **Timeline (center):** reverse-chronological by default with a toggle. Each entry shows an icon by type, the actor, a timestamp (relative, with absolute on hover), the note, and the outcome. It includes **system events** too: lead created, stage changed, reassigned, follow-up scheduled. That gives full traceability.

### 4.4 Activity Logging (P0, R3)

- A composer pinned at the top of the timeline.
- Fields: **type** (Call, WhatsApp, SMS, Email, Meeting/Visit, Test Drive, Note), **outcome** (Connected, No answer, Left voicemail, Interested, Not interested, Callback requested), **note** (free text, required, 1–2000 chars), an optional **next follow-up** datetime, and an optional **stage change**.
- One submit writes, in a single DB transaction: an activity row, plus optional stage-change and follow-up rows, plus `leads.last_activity_at`.
- Optimistic UI update, with rollback if the write fails.
- Validated with Zod on both client and server.
- Activities are **append-only** (no edit or delete) for auditability. Corrections go in as a new "Note" entry.

### 4.5 Lead Lifecycle / Stage Pipeline (P1)

```
NEW → CONTACTED → QUALIFIED → TEST_DRIVE → NEGOTIATION → WON
  ↘________________________________________________↘ LOST (reason required)
Any open stage → COLD (automatic, when there's no activity for N days) → can be revived to CONTACTED
```

- Every stage change creates a `stage_history` row (from, to, by, at, reason). This drives funnel and velocity analytics.
- LOST requires a reason: price, bought elsewhere, not ready, unreachable, or other.
- WON captures `deal_value`, which feeds revenue metrics.
- Optional Kanban board view (drag to change stage).

### 4.6 Follow-ups & Going-Cold Detection (P1)

- A follow-up = `{lead, due_at, assigned_to, status: PENDING|DONE|MISSED}`.
- **Today's Follow-ups** widget on the rep's home screen, with overdue items at the top in red.
- **Cold rules (configurable constants):**
  - No activity for **3 days** → "At risk" (amber).
  - No activity for **7 days**, or **3 or more unanswered attempts** → auto-moved to `COLD`.
- **Cadence guidance:** show "Attempt 2 of 5" and suggest the next touch based on a simple cadence (Day 0 call, Day 1 WhatsApp, Day 3 call, Day 7 email, Day 14 final).
- Implementation: compute cold state **lazily at read time** plus a lightweight interval job on server start. No queue infrastructure needed.

### 4.7 Customer Preferences & Channel Actions (P1)

- The customer has `preferred_channel` (CALL / WHATSAPP / SMS / EMAIL), `secondary_channel`, `best_time`, and `language`.
- The action bar shows the **preferred channel as the primary button**, with the others secondary.
- Clicking opens the deep link (`https://wa.me/<phone>?text=<template>`, `tel:`, `sms:`, `mailto:`) **and** pre-fills the activity composer with the type set. The rep confirms the outcome, and it's logged.
- Message templates with variables (`{firstName}`, `{model}`, `{offer}`).
- Architecture: a `ChannelAdapter` interface (`send()`, `buildLink()`). v1 uses `DeepLinkAdapter`; later adapters could be `WhatsAppBusinessAdapter` or `TwilioAdapter`.

### 4.8 Returning Customers & Offers (P1)

- **Customer ≠ Lead.** One customer can have many leads over time. Incoming leads are **deduplicated** by normalized phone or email and linked to an existing customer, which sets `is_returning = true`.
- Offers have `title, description, discount_type, value, valid_from, valid_to, eligibility` (JSON rules, for example `{ "customerType": "RETURNING", "models": ["SUV-X"], "minBudget": 20000 }`).
- The **offer matcher** filters active offers by the lead's eligibility and shows them on the detail page, plus a compact "🔥 3 active offers" strip on the rep's home screen.
- Examples: loyalty discount (returning), festive cashback (all), trade-in bonus (has trade-in), finance 0% APR (finance interest).

### 4.9 Manager Dashboard (P1)

Every metric is computed from real DB rows via SQL aggregates, with no hard-coded numbers.

- **KPI row:** new leads (period), **coverage %** (leads with ≥1 activity ÷ total), **avg first-response time**, conversion rate (WON ÷ closed), revenue won, overdue follow-ups.
- **Charts:**
  - Leads over time by source (stacked area/bar).
  - **Funnel:** NEW → CONTACTED → QUALIFIED → TEST_DRIVE → NEGOTIATION → WON.
  - Source performance: volume vs conversion per source (web form, social, walk-in, phone, referral, third-party portals).
  - Rep leaderboard table: assigned, contacted, coverage %, avg response time, won, revenue, overdue.
  - Stage aging: how long leads sit in each stage.
  - Lost reasons breakdown.
- **Filters:** date range (7/30/90 days), source, rep.
- **Drill-down:** click a rep or chart segment to open a pre-filtered inbox.

### 4.10 Demographics Analytics (P2)

- Conversion rate and preferred channel by **age band** (18–25, 26–35, 36–45, 46–60, 60+).
- Model interest by age band (heatmap).
- Channel preference distribution (donut). This supports insights like "under-35s prefer WhatsApp."

### 4.11 Lead Intake (P1: makes "incoming" real)

- `POST /api/intake/leads`, a public endpoint protected by an **API key header**. It simulates the dealership website form and social webhooks.
- Validates, dedupes against customers, auto-assigns using a **round-robin** across reps with the fewest open leads, and creates a `LEAD_CREATED` system activity.
- A demo script (`npm run simulate`) posts a new lead every few seconds so you can show leads arriving live in the inbox.

### 4.11a Showroom: Lead-Generation Demo Site (P1, D7)

- A public route, `/showroom`, styled as the "EuroDrive Motors" website: a hero banner, a vehicle grid (6 generic models with € prices), and an **"I'm interested" enquiry form** on each car.
- Form fields: name, email, phone (with country code), country/city, preferred contact channel, preferred language, budget, trade-in?, finance?, test drive?, and a message.
- A "Came from" selector (Website / Facebook ad / Instagram / Google ad / Referral) lets the demo simulate different funnels.
- Submitting calls the **same intake pipeline** as the external API: validate → dedupe customer → score → route to team → auto-assign (if enabled) → broadcast over SSE.
- In the demo, put the showroom and the rep's inbox side by side. Submit the form and the lead **appears live** with its score, priority, and assignee.
- `npm run simulate` still exists to stream random leads in for a busy-looking demo.

### 4.11b Live Updates (P1, D6)

- `GET /api/events` is a Server-Sent Events stream, authenticated by the same JWT cookie.
- An in-process event bus (Node `EventEmitter`) sends `lead.created`, `lead.assigned`, `lead.updated`, and `activity.created`.
- The server filters events by each subscriber's **visibility scope** before sending, so reps only receive events for leads they can see.
- The client invalidates the matching TanStack Query caches and shows a toast ("New lead: Anna Schmidt · HOT · assigned to you") with a highlight animation on the new row.
- Architecture doc note: the bus is single-process. The scale path is Redis pub/sub.

### 4.12 Audit & Traceability (P1 data, P2 UI)

- Every mutation writes to `audit_log` (actor, action, entity, entity_id, before/after JSON, at).
- The lead timeline already covers user-facing traceability. The audit log is the complete admin record.

### 4.13 AI-Native Features (P2: strongly recommended given the role you're interviewing for)

- **Lead summary:** a one-paragraph summary of the customer and timeline. Useful when a lead is reassigned.
- **Next-best-action:** a suggestion like "Customer asked about financing twice, prefers WhatsApp. Send the 0% APR offer via WhatsApp this evening."
- **Draft message** in the customer's preferred channel and language.
- Implementation: a server-side call to the Claude API with the lead context. Fall back to a rule-based suggestion if there's no API key, so the demo never breaks.

### 4.14 Lead Scoring, Priority & Assignment (P1, D4/D5)

**Score (0–100):** a transparent, rule-based score that is recomputed whenever a lead is created, has activity logged, or changes stage. The detail page shows the breakdown ("why this score"), which makes it easy to explain in the demo. It is deliberately not a black box.

| Factor             | Max | Rules                                                                                                                             |
| ------------------ | --- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Intent**         | 35  | Test drive requested +12 · finance interest +5 · trade-in +5 · budget given +5 · specific model chosen +4 · message > 30 chars +4 |
| **Source quality** | 15  | Referral 15 · Walk-in 14 · Phone 12 · Website 10 · Google Ads 8 · Third-party portal 6 · Social 5                                 |
| **Customer value** | 15  | Returning customer +10 · a past purchase within 5 years +5                                                                        |
| **Freshness**      | 20  | < 1h: 20 · < 24h: 15 · < 3d: 10 · < 7d: 5 · older: 0                                                                              |
| **Engagement**     | 15  | Last outcome "Interested" +15 · "Callback requested" +10 · "Connected" +6 · each unanswered attempt −3 (min 0)                    |

**Priority bands:** 🔴 **HOT** ≥ 70 · 🟠 **WARM** 40–69 · 🔵 **COOL** < 40. (COOL is a priority band and is separate from the `COLD` stage.)

**SLA flags** layered on top:

- **"Respond now":** a NEW lead untouched for more than 15 min (HOT) or more than 2h (others).
- **Overdue follow-up:** `due_at < now`.

**Default inbox ranking:** overdue follow-ups → SLA breaches → score descending → newest.
_Future (AI):_ train on WON/LOST history to learn the weights. The rule-based score is the cold-start baseline.

**Assignment pipeline** (runs on intake):

1. **Route to team** by the customer's country (DACH → Team DACH; FR/BE/NL/LU → Team West; IT/ES/PT → Team South; anything else → round-robin across teams).
2. If the team has **auto-assign ON**, pick a rep using the team's strategy:
   - `LOAD_BALANCED` (default): among active reps, pick the one with the fewest open leads. Ties are broken by the oldest last-assigned time.
   - `LANGUAGE_MATCH`: restrict to reps who speak the customer's language, then load-balance. Falls back to all reps if none match.
   - `ROUND_ROBIN`: a strict rotation.
3. If auto-assign is OFF, the lead lands in the team's **Unassigned pool**. Reps can **Claim** it (up to 25 open leads each), or the manager assigns it from the pool.
4. Every assignment writes a timeline system event ("Auto-assigned to Sofia Rossi · language match: IT") and broadcasts over SSE.
5. **Auto-reassign (P2):** a HOT lead untouched for 30 min goes back to the pool and the manager is notified.

---

## 5. Data Model (SQLite)

```
users           (id, name, email UNIQUE, password_hash, role[REP|MANAGER|VP],
                 manager_id → users, team_id → teams, languages JSON, avatar_color,
                 is_active, last_assigned_at, created_at)

teams           (id, name, region, countries JSON, manager_id → users,
                 auto_assign BOOLEAN, assign_strategy[LOAD_BALANCED|LANGUAGE_MATCH|ROUND_ROBIN])

customers       (id, first_name, last_name, phone UNIQUE, email, age, age_band,
                 city, preferred_channel, secondary_channel, best_time, language,
                 is_returning, created_at)

leads           (id, customer_id → customers, source, source_detail, stage,
                 team_id → teams, owner_id → users NULL, score, priority, score_breakdown JSON,
                 message, vehicle_interest, budget_min, budget_max,
                 has_trade_in, wants_finance, test_drive_requested, score,
                 lost_reason, deal_value, first_response_at, last_activity_at,
                 attempt_count, created_at, updated_at, closed_at)

activities      (id, lead_id → leads, actor_id → users NULL, type, outcome,
                 note, channel, is_system, metadata JSON, created_at)   -- append-only

stage_history   (id, lead_id, from_stage, to_stage, changed_by, reason, changed_at)

follow_ups      (id, lead_id, assigned_to, due_at, status, completed_at, created_by, created_at)

offers          (id, title, description, discount_type, value, valid_from, valid_to,
                 eligibility JSON, is_active)

purchases       (id, customer_id, vehicle, amount, purchased_at)      -- returning-customer history

audit_log       (id, actor_id, action, entity, entity_id, before JSON, after JSON, created_at)
```

**Indexes** (the reads are the hot path): `leads(owner_id, stage)`, `leads(created_at)`, `leads(last_activity_at)`, `leads(source)`, `activities(lead_id, created_at)`, `follow_ups(assigned_to, status, due_at)`, `customers(phone)`, `customers(email)`.

**Pragmas:** `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5000`.

---

## 6. Seed Data (all dummy data, generated with Faker using a fixed seed so every run is identical)

- 1 admin, 2 managers, 8 reps (4 per team).
- ~600 customers, ~20% returning (with purchases).
- ~800 leads spread over the **last 90 days** with realistic distributions:
  - Sources: Website form 35%, Facebook/Instagram 20%, Google Ads 15%, Walk-in 10%, Phone 8%, Referral 7%, Third-party portal 5%.
  - Stages weighted toward the top of the funnel, with a realistic ~12–18% win rate.
  - Age bands skewed so channel preference correlates with age (younger → WhatsApp, older → Call). That gives the demographics charts a real story.
- 3–15 activities per lead, with timestamps that respect the lead's stage history.
- Deliberately neglected leads (overdue, going cold) so those features have something to show.
- 5–6 offers, including one expired, to prove the matcher's date filtering works.
- `npm run db:reset` → migrate + seed in one command.

---

## 7. UX / Screen Layout (pixel budget)

Design principles: **density over decoration**, the one thing a rep should do next always visible, color used only to signal meaning (stage, overdue, source), and keyboard-friendly.

```
┌──────┬───────────────────────────────────────────────────────────────┐
│ Nav  │ Top bar: search ⌘K · offers strip (🔥3) · user menu             │
│ 56px ├───────────────────────────────────────────────────────────────┤
│ icons│                                                               │
│      │  (page content)                                               │
└──────┴───────────────────────────────────────────────────────────────┘
```

**Rep Home / Inbox**

```
[Due today: 6 · Overdue: 2 · New: 4 · Going cold: 3]   ← clickable stat chips
[Tabs: My Leads | Unassigned | Due Today | Going Cold]  [filters] [search]
┌─────────────────────────────────────────────────────────────────────┐
│ ● Name         Vehicle     Source   Stage      Age  Last act.  Next │  dense rows, 40px
└─────────────────────────────────────────────────────────────────────┘
```

**Lead Detail**

```
┌────────────────┬──────────────────────────────────┬─────────────────┐
│ Customer card  │  [Activity composer]             │ ★ WhatsApp (pri)│
│ Interest card  │  ── Timeline ──                  │   Call  SMS  ✉  │
│ History (ret.) │  ● Called — No answer · 2h ago   │ Next follow-up  │
│                │  ⇄ Stage NEW→CONTACTED · 1d      │ Offers (3)      │
│ 280px          │  flex                            │ AI suggestion   │
│                │                                  │ 300px           │
└────────────────┴──────────────────────────────────┴─────────────────┘
```

**Manager Dashboard:** KPI row (6 tiles) → [Leads by source over time | Funnel] → [Rep leaderboard table | Source conversion] → [Demographics | Lost reasons].

Responsive: the three columns collapse to tabs below 1024px. A dark mode toggle is cheap to add with Tailwind.

---

## 8. API Surface

| Method | Route                                                   | Auth                 | Purpose                               |
| ------ | ------------------------------------------------------- | -------------------- | ------------------------------------- |
| POST   | `/api/auth/login`                                       | public               | Verify credentials, set JWT cookie    |
| POST   | `/api/auth/logout`                                      | any                  | Clear cookie                          |
| GET    | `/api/auth/me`                                          | any                  | Current user                          |
| GET    | `/api/leads?stage=&source=&owner=&q=&view=&page=&sort=` | any (scoped by role) | Inbox                                 |
| GET    | `/api/leads/:id`                                        | scoped               | Lead + customer + offers + follow-ups |
| GET    | `/api/leads/:id/activities`                             | scoped               | Timeline                              |
| POST   | `/api/leads/:id/activities`                             | scoped               | **Log activity** (transactional)      |
| PATCH  | `/api/leads/:id`                                        | scoped               | Stage / owner / fields                |
| POST   | `/api/leads/:id/follow-ups`                             | scoped               | Schedule a follow-up                  |
| PATCH  | `/api/follow-ups/:id`                                   | scoped               | Mark done                             |
| GET    | `/api/dashboard/summary?from=&to=&team=`                | MANAGER+             | KPIs                                  |
| GET    | `/api/dashboard/charts/:chart`                          | MANAGER+             | Chart series                          |
| GET    | `/api/offers/active`                                    | any                  | Offers strip                          |
| POST   | `/api/intake/leads`                                     | API key              | Website/social lead ingestion         |
| POST   | `/api/leads/:id/ai/suggest`                             | scoped               | AI next-best-action (P2)              |

Every endpoint runs through: **authenticate → Zod-validate → authorize (policy) → service → repository**. Errors come back in one consistent shape: `{ error: { code, message } }`.

---

## 9. Technology Options & Recommendation

### 9.1 Next.js full-stack vs separate frontend and backend

|                                                | **Option A: Next.js (App Router) monolith**            | **Option B: React (Vite) + Express/Fastify** |
| ---------------------------------------------- | ------------------------------------------------------ | -------------------------------------------- |
| Setup and speed                                | ✅ One repo, one `npm run dev`                         | Two apps, CORS, two dev servers              |
| Type sharing                                   | ✅ Automatic                                           | Needs a shared package                       |
| Auth                                           | ✅ Middleware plus httpOnly cookies, simple            | Manual cookie/CORS configuration             |
| Clean layering to show in the architecture doc | ⚠️ Needs discipline (keep services/repos in `/server`) | ✅ A natural boundary                        |
| Demo and interview signal                      | ✅ Modern and pragmatic                                | Classic, a bit more boilerplate              |

**Recommendation: Option A (Next.js)** with a strictly layered `server/` folder (routes → services → repositories). You get the speed of a monolith and still show clean architecture. The service layer doesn't depend on the framework, so you could extract it into a standalone API later. Say that in the architecture doc.

### 9.2 Recommended stack

| Layer            | Choice                                                                                                          | Why                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Framework        | **Next.js 15 (App Router) + TypeScript**                                                                        | Full stack in one place, Server Components for fast read-heavy pages                  |
| UI               | **Tailwind CSS + shadcn/ui**                                                                                    | Lightweight, dense, looks professional quickly, you own the components                |
| Tables           | **TanStack Table**                                                                                              | Sorting, filtering, and pagination for the inbox                                      |
| Charts           | **Recharts**                                                                                                    | Simple and React-native, covers every chart in §4.9                                   |
| Data fetching    | Server Components for reads, **TanStack Query** for client mutations and optimistic updates                     |                                                                                       |
| DB               | **SQLite (better-sqlite3)** in WAL mode                                                                         | Zero ops, fast synchronous reads                                                      |
| ORM / migrations | **Drizzle ORM + drizzle-kit**                                                                                   | Lightweight, SQL-like, typed. Switching to Postgres only changes the driver.          |
| Validation       | **Zod**                                                                                                         | Shared client and server schemas                                                      |
| Auth             | **`jose` (JWT) + `bcryptjs`**, httpOnly cookie                                                                  | You can explain every line in the interview. Auth.js adds magic you'd have to defend. |
| Seed             | **@faker-js/faker** with a fixed seed                                                                           | Reproducible demo data                                                                |
| Testing          | **Vitest** (services and policy), **Playwright** (golden-path E2E: login → open lead → log activity → persists) |                                                                                       |
| AI (P2)          | **Claude API** (`@anthropic-ai/sdk`) with a rule-based fallback                                                 | Shows AI-native thinking                                                              |
| Tooling          | ESLint, Prettier, optional Docker Compose                                                                       |                                                                                       |

---

## 10. Architecture

```
            ┌──────────────────────── Browser ────────────────────────┐
            │ Next.js React UI (Server + Client Components)           │
            │ TanStack Query · shadcn/ui · Recharts                    │
            └───────────────┬─────────────────────────────────────────┘
                            │ HTTPS · httpOnly JWT cookie
┌───────────────────────────▼──────────────────────────────────────────┐
│ Next.js Server                                                       │
│  middleware.ts ── JWT verify (jose) → attach user / redirect         │
│  app/api/**   ── Route handlers (thin: parse, validate, call service)│
│  server/                                                             │
│   ├─ auth/        login, token issue/verify, password hashing        │
│   ├─ policy/      authorize(user, action, resource)  ← RBAC          │
│   ├─ services/    LeadService, ActivityService, DashboardService,    │
│   │               OfferMatcher, AssignmentService, ColdLeadJob,      │
│   │               AiSuggestionService                                │
│   ├─ channels/    ChannelAdapter → DeepLinkAdapter (future: WA/Twilio)│
│   └─ db/          Drizzle schema, repositories, migrations, seed     │
└───────────────────────────┬──────────────────────────────────────────┘
                            │
                   ┌────────▼────────┐        ┌──────────────────────┐
                   │ SQLite (WAL)    │        │ Claude API (optional)│
                   │ data/app.db     │        └──────────────────────┘
                   └─────────────────┘
   External: website form / social webhook ──► POST /api/intake/leads (API key)
```

**Key architectural decisions (ADR-style, for the architecture doc):**

1. Monolith over microservices: team size and scope favor it. The layered boundaries keep extraction possible.
2. SQLite over Postgres: read-heavy, small data, zero ops. Drizzle keeps migration cheap.
3. JWT in an httpOnly cookie over localStorage: resistant to XSS. SameSite plus same-origin reduces CSRF risk.
4. Append-only activities: auditability and a trustworthy timeline.
5. Deep links over real messaging integrations: most of the value, without vendor onboarding. An adapter interface leaves room to extend.
6. Lazy cold-lead computation plus an interval job over a queue: no extra infrastructure.
7. Customer vs lead separation: enables returning-customer detection and offer eligibility.

**Scale path (a talking point):** SQLite → Postgres, add a Redis cache for dashboard aggregates, push events via SSE/WebSocket for live inbox updates, a job queue (BullMQ) for cadence and cold rules, and real channel adapters.

---

## 11. Non-Functional Requirements

- **Performance:** inbox and detail pages under 200ms server time with the seed data. Dashboard aggregates under 300ms, using indexed SQL aggregates.
- **Security:** bcrypt, httpOnly JWT, server-side RBAC on every endpoint, Zod validation, parameterized queries through the ORM, API key on intake, no secrets in the repo (`.env.example`).
- **Reliability:** activity plus side effects in one transaction. FK constraints on.
- **Observability:** structured request logs (method, route, user, latency) and an audit log.
- **Accessibility:** keyboard navigation, focus states, and color is never the only signal (chips have text too).

---

## 12. Delivery Plan

| Phase  | Deliverable                                                                                                                  | Est.       |
| ------ | ---------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 0      | Scaffold Next.js, Tailwind, shadcn, Drizzle, SQLite. Schema, migrations, seed.                                               | 0.5 day    |
| 1 (P0) | Auth (login, JWT, middleware), Inbox, Lead Detail, Activity Logging. **Mandatory items done.**                               | 1 day      |
| 2 (P1) | RBAC policy, stages and history, follow-ups and cold detection, preferences and deep links, offers, intake API and simulator | 1–1.5 days |
| 3 (P1) | Manager dashboard and charts, rep leaderboard, drill-downs                                                                   | 1 day      |
| 4 (P2) | Demographics, AI suggestions, audit view, polish, dark mode                                                                  | 0.5–1 day  |
| 5      | Tests (Vitest + one Playwright E2E), README, architecture doc, demo video                                                    | 0.5 day    |

---

## 13. Demo Script (~5–7 min video)

1. **Problem statement** (20s): dealership leads are scattered across channels, and follow-ups get missed.
2. **Login as Rep** → inbox with stat chips → filter "Due Today".
3. **Open a lead** → customer card, returning-customer badge, matched offers, timeline.
4. **Click WhatsApp (preferred)** → deep link opens, composer pre-filled → log outcome and schedule a follow-up → timeline updates → **refresh to prove it persisted** (R3).
5. Run `npm run simulate` → **a new lead appears** in the inbox, auto-assigned.
6. **Login as Manager** → dashboard KPIs, funnel, source chart, leaderboard → drill into a rep with low coverage → reassign a cold lead.
7. **AI suggestion** on a lead (if built).
8. **Architecture walkthrough** (60–90s): diagram, key decisions, scale path.

---

## 14. Open Questions

Resolved in §0 (D1–D8). The remaining questions are asked directly in chat.

## 15. Today's Build Order (deadline-driven)

1. Scaffold, schema, seed (EU data, 3-level hierarchy, teams).
2. Auth plus scope-based RBAC.
3. **P0:** Inbox → Lead Detail + Timeline → Activity Logging. _Checkpoint: the mandatory items are demoable._
4. Intake pipeline (score → route → assign) plus `/showroom` plus SSE live inbox.
5. Claim / assign / auto-assign settings.
6. Manager and VP dashboards.
7. Offers, follow-ups, cold detection, deep links.
8. AI summary / next-best-action (with rule-based fallback).
9. README plus architecture doc (derived from this plan) plus a Playwright smoke test.
