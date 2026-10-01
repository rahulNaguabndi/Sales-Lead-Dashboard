# EuroDrive Lead Desk — Role-Based UX & QA Audit

**Date:** 2026-10-01 · **Build:** `main` @ `28bccbf` ("improvements") + uncommitted edits to `InboxView.tsx`, `KanbanBoard.tsx`, `KanbanCard.tsx`, `lead-query*.ts`, new `ScoringInfoModal.tsx`
**Method:** Hands-on testing in a real browser (Claude in Chrome, plus Playwright and the in-app browser for the Rep pass), acting as each demo persona. Every finding below was reproduced in the UI or verified against the API, unless it's marked *Needs re-check*.
**Personas tested:** Sofia Rossi (REP, South) · Lukas Becker (MANAGER, DACH) · Isabelle Laurent (VP). Anna Weber (REP, DACH) was not tested separately.
**Spec baseline:** `docs/01-personas.md` (permission table), `docs/features/F03-hierarchy-rbac.md` (US-1).

Severity: **P0** = security, data loss, or a broken core job · **P1** = wrong data or a broken flow · **P2** = significant UX or consistency problem · **P3** = polish.

---

## 0. Executive summary (the brutal version)

The app looks finished. It is not trustworthy yet:

1. **Reps can read every lead in their team.** This contradicts the spec and was introduced in the last commit. It also creates a dead end: the list shows the lead, but opening it gives a 404.
2. **The default inbox view (board) silently shows 50 leads out of 121 (Manager) or 288 (VP).** The column counts are wrong. A manager reading the board is looking at roughly 40% of the team pipeline. A VP is looking at roughly 17% of the org.
3. **Saving does not refresh the screen.** Logging an activity returns 201, but the timeline stays unchanged until you reload. Claiming a lead shows a success toast while the list keeps the old state for 3–5 seconds.
4. **The same number disagrees with itself on the same screen.** "Due today 14 / Overdue 10" sits directly above "Nothing due today · Due today 0 · Overdue 0".
5. **There are four different vocabularies for lead source** and two for vehicle (slug vs name). Raw enums such as `TEST_DRIVE`, `PAID_SEARCH` and `BOUGHT_ELSEWHERE` show up in user-facing UI.
6. **Managers cannot rebalance from the inbox.** There is no multi-select, no bulk assign and no inline assign. You open leads one at a time. "Rebalance workload" is the manager persona's #1 job.

---

## 1. P0 — Security, data exposure, data loss

### P0-1 · Reps can read the whole team's leads (RBAC regression)
- **Role:** REP · **Where:** Inbox "Team" tab, and `GET /api/leads?view=team`
- **Repro:** Log in as Sofia → Inbox → the **Team** tab is visible. Alternatively, call `GET /api/leads?view=team&pageSize=50`.
- **Actual:** HTTP 200 with **79 leads** owned by Luca Romano (12), João Silva (9), Marta García (15), Sofia (10) and 4 unassigned (first page). The payload exposes customer name, city, country, preferred channel, stage, score and owner.
- **Expected (F03 US-1, personas permission table):** a rep sees only `owner = self` OR (`owner IS NULL` AND `team = own team`).
- **Root cause:** commit `28bccbf`:
  - `InboxTabs.tsx` now always pushes the `team` tab (the `if (caps.leader)` guard was removed).
  - `lead-query.ts buildWhere()` adds `p.view === 'team' && !caps.leader → leads.team_id IN (...)`.
- **Fix:** Revert both changes, or update F03 and the personas doc if this is an intentional product change. Either way, add an API test that asserts a REP gets 403 or an empty result for `view=team`.

### P0-2 · Rep "Team" view is a dead end (list and detail scopes disagree)
- **Role:** REP · **Where:** Inbox → Team → click a teammate's card
- **Actual:** Navigates to **"Lead not found. It may not exist or you may not have access."**, because `GET /api/leads/:id` returns 404 for leads the list just showed.
- **Expected:** The list and the detail page must use the same scope function. Fixing P0-1 removes this.

### P0-3 · The default board silently truncates to 50 leads
- **Roles:** MANAGER, VP (and any rep with more than 50 leads) · **Where:** Inbox, board view (the board is now the **default**, per uncommitted `InboxView.tsx`: `useState('board')`)
- **Evidence:**

  | Role | API total | Cards on board | Board column counts vs truth (Pipeline page) |
  |---|---|---|---|
  | Manager (DACH) | 121 | 50 | Contacted 13 vs **41**, Qualified 9 vs **34**, Test drive 4 vs **14**, Negotiation 4 vs **12** |
  | VP | 288 | 50 | ~17% of the org pipeline visible |

- **Why it's P0:** There is no "showing 50 of 121", no pagination and no "load more". The column badge counts look authoritative and are wrong. Managers will make staffing decisions on this.
- **Fix:** Either fetch per column with true counts (`GROUP BY stage`) plus virtualised or infinite columns, or show "50 of 121 — refine filters" prominently. Never show a truncated count as a total.

---

## 2. P1 — Broken flows and wrong data

### P1-1 · A logged activity does not appear until a full reload
- **Role:** REP (very likely all roles) · **Where:** Lead detail → "Log an activity…"
- **Repro:** Sofia → lead `EDM-2026-00536` (Olivia Zayas Rodríguez) → Call · Connected · note → Ctrl+Enter.
- **Actual:** `POST /api/leads/:id/activities` returned **201**. The composer cleared. **The timeline did not update** (no refetch fired, and still nothing after 6 seconds). The entry appears only after a page reload.
- **Expected:** Optimistic insert into the timeline, or `invalidateQueries(['lead', id, 'activities'])` in the mutation's `onSuccess`. Don't rely on SSE alone: `invalidation.ts` maps `activity.created` but the composer doesn't invalidate locally.
- **Impact:** Reps will log the same call twice, which corrupts the touch metrics on the dashboard.

### P1-2 · Claiming a lead gives stale UI for 3–5 seconds
- **Role:** REP · **Where:** Inbox → Unassigned → Claim
- **Actual:** The "Lead claimed" toast appears immediately. The row stays in the Unassigned list and the counts stay at "My Leads 14 / Unassigned 4" for 3–5 seconds, then update via SSE.
- **Expected:** Optimistically remove the row and adjust the counts. Today a rep can click Claim twice, or claim the next row thinking the first one failed.

### P1-3 · The board view has no Claim action
- **Role:** REP · **Where:** Inbox (board is the default) → Unassigned
- **Actual:** Unassigned cards have no Claim button. The rep has to discover the table toggle first. Claiming is one of the rep persona's five jobs.

### P1-4 · Two counters on the same screen contradict each other
- **Roles:** MANAGER, VP · **Where:** Inbox header
- **Actual:** The stat chips say "Due today 14 · Overdue 10" (Manager) or "Due today 25 · Overdue 21" (VP). Directly below, "Today's follow-ups" says **"Nothing due today · Due today 0 · Overdue 0"**.
- **Cause:** The widget is scoped to the logged-in user's own follow-ups and the chips are scoped to the team, with no label to say so.
- **Fix:** For leaders, scope the widget to the team or label it "Your own follow-ups". Better still, merge it with the chips (see my earlier review).

### P1-5 · Follow-up state contradicts itself
- **Where:** Lead detail → Next follow-up (Olivia Zayas Rodríguez, Boris Scheer)
- **Actual:** "**Cadence complete · 5 of 5 attempts**" is shown next to "**15 h overdue**", with Done, Snooze +1 h, Snooze tomorrow, Cancel and Reschedule. After a successful "Connected" call was logged, the follow-up was **still overdue**, and nothing prompted the rep to complete it.
- **Expected:** Logging a connected touch should offer "Mark follow-up done". A completed cadence should not show as overdue.

### P1-6 · The Rep's dashboard funnel disagrees with the pipeline
- **Role:** REP (Sofia) · **Where:** Dashboard → Funnel ("View as table") vs the Pipeline page
- **Actual:** The funnel says **WON reached 4**. The Pipeline page says **Won (30d) 11**, and the dashboard Revenue KPI (438.173 €) equals the 11-deal total. The funnel also shows **NEGOTIATION reached 5 > TEST_DRIVE reached 4**, which is non-monotonic, so it isn't a real funnel.
- **Fix:** Pick one definition (a created-in-period cohort or a won-in-period count) and label it. A funnel must be monotonic: count a stage as "reached" when any later stage was reached.

### P1-7 · The scoring and staffing caps are not enforced
- **Role:** MANAGER · **Where:** Team settings; Assign to…
- **Actual:** "Max open" is **1000** for every rep. The reps have 23–38 open leads, while the spec says a rep may hold at most 25 open (claim cap). The assign list happily offers a rep with 38 open, with no warning.
- **Fix:** Set realistic defaults (25), validate the input, and show an "over capacity" badge in Assign to….

### P1-8 · Managers cannot assign from the inbox
- **Role:** MANAGER, VP · **Where:** Inbox table and board
- **Actual:** There are no checkboxes, no bulk action bar and no inline owner picker. (`components/leads/assign/BulkActionBar.tsx` exists but is not rendered in the inbox.) Reassigning means: open a lead → Assign to… → pick → back → repeat.
- **Expected:** Multi-select with a bulk "Assign to…", and drag-to-rep on the board. This is the manager persona's job #1 and #3.

### P1-9 · *Needs re-check* — Rep dashboard bar charts render near zero
- **Role:** REP · **Where:** Dashboard → "Touches per day" and "Funnel"
- **Observed:** The y-axis runs to 16 but the bars render at roughly 0–1 tall. The table view shows values of 2–15. The same charts render correctly for the Manager, so this may have been captured mid-animation. It should be reproduced deliberately before anyone fixes it.

---

## 3. P2 — Consistency and mismatches

### P2-1 · Four different vocabularies for lead source
| Place | Values shown |
|---|---|
| Inbox, Pipeline filter | Website, Facebook, Instagram, **Google ads**, Portal, **Walk in**, Phone, Referral |
| Inbox source badges | Website, **Google Ads**, Walk-in, … |
| Dashboard "All sources" filter, "Leads over time" legend | **WEBSITE, SOCIAL, PAID_SEARCH, PORTALS, OFFLINE, REFERRAL** (a different taxonomy, grouped) |
| Dashboard "Source performance" | **WEBSITE, FACEBOOK, WALK_IN, GOOGLE_ADS** (raw enums, ungrouped) |
| Offer form "Lead sources" | **google ads, walk in** (lowercase) |

One dashboard uses two taxonomies in adjacent charts. Define one `sourceLabel()` and one optional `sourceGroup()` and use them everywhere.

### P2-2 · Vehicle shown as a slug in some places and a name in others
- **Slugs:** Pipeline cards (`nova-van`, `aurora-suv`), Offers "Who is eligible" (`Models: luma-ev, aurora-suv`).
- **Names:** Inbox (Nova Van), Lead detail (Nova Van), offer form chips (Aurora SUV), Demographics (Aurora SUV).
- **"No model":** shown on the Pipeline, while the Inbox shows "—".

### P2-3 · Raw enums leak into the UI
- **Stage enums:** `TEST_DRIVE`, `NEGOTIATION` on the dashboard funnel and stage-aging axes and in the funnel table. The composer shows "No change (NEGOTIATION)" and "Move to CONTACTED".
- **Lost reasons:** `BOUGHT_ELSEWHERE`, `NOT_READY` in the Lost reasons chart.
- **Audit actions:** `lead.assign`, `auth.login`, `lead.auto_cold: changed stage`, and the entity column shows `user 01K6D7WTG08GPMX…` (a raw ULID) for login events.
- **Filter chip after a dashboard drill-down:** `team: 01K6D7WTG08GPMXJHPNHYPKQZG`, which should read "Team DACH".
- **Timeline:** "Stage changed from qualified to negotiation" in lowercase.

### P2-4 · Number, date and casing formats are mixed
- **Currency in German format** (`1.500 €`, `438.173 €`) in an English UI, while offer descriptions use English format ("EUR 1,500 extra"). Both appear in the **same table row**.
- **Value spacing:** "0 % APR" has a stray space.
- **Dates:** "2 Jul 2026", "29 Sept 2029", the dashboard axis "09-04", the funnel table "2026-09-02", the inbox "3 Oct 15:59", and the audit log in relative time only.
- **Casing:** "Whatsapp" (Customer card) vs "WhatsApp" (everywhere else); "Google ads" vs "Google Ads".
- **Language codes:** Team settings "de, en"; the assign dropdown "DE GB" (it uses the **country** GB for the English **language**); the lead detail "Language ES".

### P2-5 · KPI deltas say "New vs prev." when there's no comparison
- **Where:** "Open leads", "Due today", "Overdue follow-ups" on every role's dashboard.
- **Problem:** The label reads as if something is new. Show "—" or hide the delta line.
- **Also:** deltas like **+1064.5 %** (Rep revenue) and **+406 %** (VP revenue) are presented without a sanity cap or a "low base" note.

### P2-6 · Duplicate customers and leads with no grouping
- **Examples:**
  - Boris Scheer has two open leads in Contacted (luma-ev, nova-van).
  - Libero Guidi is owned by both Luca Romano and João Silva.
  - Miranda Bennardo appears twice in Won.
  - Elda Floridia appears in both Contacted and Lost.
  - Amando Ambrosino appears in both New and Won.
- **What's missing:** No "2 open leads for this customer" indicator, and nothing stops two reps from working the same person.

### P2-7 · Two kanbans that disagree
- **The two kanbans:** `/inbox` board view and `/pipeline`.
- **Visual style:** different column styles (coloured top border vs chip headers).
- **Card content:** different, for example score and days-in-stage vs city and source.
- **Filters:** "All owners" on Pipeline vs the Filters panel in the Inbox.
- **Counts:** the Pipeline is correct and the inbox board is truncated (P0-3).
- **Why it matters:** The inbox board shows empty **Won/Lost** columns, while the Pipeline shows Won (30d) and Lost (30d). Pick one board and make it correct.

### P2-8 · Demographics rules are inconsistent
- **Thresholds:** The small-sample threshold is "min 30" on the channel chart. The conversion chart shows 36–45 at **n = 27** but hides 18–25 at n = 16. The model heatmap shows the 60+ row that the other two charts suppress.
- **Defaults:** The period defaults to **90 days** here and **30 days** on the Overview, and filters don't carry over. "All reps" disappears.
- **Navigation:** Opened directly at `/dashboard/demographics`, the Overview/Demographics tab bar is gone and there's no way back except the nav rail.
- **Label:** The Manager's chart says "organization average". Either it's mislabelled or it exposes an org-wide number to a team-scoped role.
- **Rep access:** a Rep is *silently redirected* to `/dashboard`.

### P2-9 · Access-denied handling differs across routes
| Route (as REP) | Behaviour |
|---|---|
| `/team/settings` | 404 page |
| `/audit` | HTTP **200** rendering "403 · Not allowed" |
| `/dashboard/demographics` | Silent redirect to `/dashboard` |
| `/api/audit` | 403 JSON |
| `/api/leads?view=org` | 400 VALIDATION_ERROR, but `view=all` is **accepted** and treated as `team` |

Pick one pattern: a 403 page with an explanation and a real 403 status.

### P2-10 · Interactions that look clickable but aren't, or are clickable but don't look it
- **Team comparison rows:** The VP's hint says "Select a team to see its rep leaderboard", but the rows aren't clickable (cursor auto, no role). The only drill-down is the "All teams" dropdown.
- **Lead score card:** "Select the badge for the breakdown" is the only content in a card that otherwise takes a full card's height.
- **Board cards:** These are plain `div`s with `cursor:pointer`. They are not links, have no `role`/`tabIndex`, and can't be reached by keyboard or read as links by a screen reader. They also can't be opened in a new tab.

### P2-11 · Composer defaults ignore the customer's preference
- **Activity type:** The composer defaults to **Call** even when the preferred channel is **Email** (Olivia) or **WhatsApp** (Boris).
- **Disabled submit:** "Log activity" is disabled with no hint of which fields are required. Clicking it does nothing.
- **Backward moves:** The stage dropdown offers backward moves (Negotiation → "Move to CONTACTED") with no confirmation.
- **Drafts:** A half-typed draft is lost on navigation or resize; there's no draft persistence.

### P2-12 · Offer management (VP)
- **Expired offers:** "Summer Sale" still offers **Deactivate**.
- **Delete styling:** Delete is a plain text button next to Deactivate. It's only present on unapplied offers, which leaves the actions column ragged.
- **Hidden errors:** In the New offer modal, the Title error sits above the scroll area; there's no scroll or focus to the first invalid field.
- **Validity:** offers valid until **2029** (0% APR, EV Switch Grant, Trade-in Boost) look like seed mistakes, but nothing flags unusually long validity.

### P2-13 · Assign to… picker
- **Current owner:** The current owner (Felix Wagner) is listed as a target with no "current" marker.
- **Unassign:** "Unassign → return to pool" runs immediately with no undo. The audit log shows a manual unassign happened during this session.

### P2-14 · Team settings
- **Max open:** 1000 for everyone (see P1-7).
- **Rebalance pool:** no explanation of what it does, no preview and no confirmation.
- **Save:** disabled with no "unsaved changes" state.
- **Layout:** a narrow centred card (~480px) on a 1920px screen, while the other admin page (Audit) is ~640px and the dashboards are full width. The page widths are inconsistent.

---

## 4. P3 — Polish, accessibility, performance

### Accessibility
- **Empty heading:** The app shell renders an **empty `<h1>`** in the banner, and every page's real heading is an `h2`.
- **Identical button names:** All four demo buttons are named "Login as". All Claim buttons are named "Claim". Screen readers can't tell them apart (use `aria-label="Claim lead for Serviliano Fiorenza"`).
- **Emoji icons:** ⏱ and ⚠ in the dashboard tables, 🇮🇹 flags, and ↺ for returning customers. Flags render as letters on Windows Chrome.
- **Low-contrast avatars:** White text on cyan (FW) and pink (LH). Avatar colours are random per user and don't meet contrast requirements.
- **Initials only:** Owner avatars show only initials. The full name needs a hover, which isn't available on touch.
- **Timeline avatars:** These show "F" or "S" (one letter), while everywhere else shows two-letter initials.
- **Hydration warnings:** "Extra attributes from the server: style" on the search `Input` in dev, and "Text content did not match" on the My Leads count (live data drift between server render and client).

### Performance and network
- **Lead detail fetches:**
  - It fetches `GET /api/customers/:id` **twice** on load.
  - The header badge fetches `offers?status=active` **3–4 times** per navigation.
  - **`POST /ai/suggest` fires automatically** on every lead open. That costs money and latency for a panel most visits never use, so make it on-demand.
- **Inbox → lead navigation:** This takes 2–5 seconds in dev, with no loading state on the clicked row or card.
- **"Reconnecting…":** The SSE indicator shows "Reconnecting…" in both the header **and** the dashboard on every full navigation. The offers badge shows "– offers" in the meantime.

### API hygiene
- **Empty search:** `q=` returns **400**. Clearing the search box must never send an empty `q`.
- **Unknown views:** `view=all` is accepted and silently means `team`, while `view=org` returns 400. Validate consistently.
- **Missing favicon:** `/favicon.ico` returns 404 on every page.

### Copy and content
- **Page titles:** Only Pipeline and Lead detail set them. Inbox, Dashboard, Offers, Audit and Team settings all read "EuroDrive Lead Desk".
- **Not-found page:** "Lead not found" repeats as both the heading and the body.
- **Pipeline cards:** They say "Score 55" **and** "WARM 55 priority" (the same fact twice). Detail headers show the stage twice (a chip plus "Stage: X" dropdown) and Returning twice (a header chip plus a customer card chip).
- **Contact card:** Copy phone and Copy email appear in the Customer card **and** Copy number appears in the Contact card.
- **Days in stage:** The Pipeline says "7d in stage" while the timeline shows the stage change was 8 days ago (rounding).
- **Seed data contradicts itself:** a German customer with an `@orange.fr` address; "Mailed him" for a female customer; "Check test drive availability" on a lead in Negotiation with "Test drive requested: No". These show up in demos.

### Layout
- **Phone width (~375–500px):** The page scrolls horizontally. The header crushes the user name onto 3–4 lines and collapses the global search into an empty box. The sidebar never collapses. Inbox rows truncate names to "R." (see the earlier responsive review).
- **Board scrolling:** The board has nested scrollbars (each column scrolls inside a scrolling page). Even at 1920px, the Won and Lost columns of the Pipeline and the Lost column of the inbox board sit off-screen behind a horizontal scrollbar.
- **View mode:** It isn't persisted. A reload snaps back to Board after choosing Table.

---

## 5. What works well
- **Manager and VP numbers agree across views:** the Pipeline's open totals, pipeline value (2,681,000 € DACH), Won (30d) and revenue match the dashboard and leaderboard. The VP revenue equals the sum of the teams (3,428,654 €).
- **Manager scope is correct:** another team's lead returns 404, and the Assign picker only lists DACH reps, sorted by load, with a language-match hint.
- **Dashboard drill-down works:** SLA breach links open the inbox correctly filtered (20 for DACH, matching).
- **Login errors are handled:** an "Invalid email or password." message appears inline. Logout clears the session, and a protected route redirects to `/login?next=…`.
- **The Demographics page is the most polished screen:** it has sample-size warnings, chart and table toggles, a methodology link, and an exclusion footnote.
- **The audit log is complete and readable** apart from the raw codes noted above.

---

## 6. Recommended fix order
1. **P0-1/P0-2** RBAC regression: revert or re-spec, and add an API test.
2. **P0-3** board truncation: true per-stage counts, or switch the default back to Table until fixed.
3. **P1-1/P1-2** mutation → cache invalidation and optimistic updates (activity, claim, assign, follow-up).
4. **P1-4/P1-5/P1-6** contradicting numbers: one scope per widget, one funnel definition.
5. **P1-8** bulk and inline assign for leaders, plus caps (P1-7).
6. **P2-1–P2-4** one label layer: `sourceLabel`, `vehicleName`, `stageLabel`, `lostReasonLabel`, `formatMoney(locale)`, `formatDate`. Ban raw enums in JSX through a lint rule or a test.
7. Then the P2/P3 polish and accessibility pass.

---

## 7. Test footprint (changes made to local demo data during this audit)
- Logged one activity on `EDM-2026-00536` (Olivia Zayas Rodríguez) as Sofia, with the note **"[UX audit test] Called to confirm delivery time."**
- Claimed lead **Serviliano Fiorenza** (`EDM-2026-00777`) for Sofia Rossi from the South unassigned pool.
- Opened and cancelled (unsaved) the "Assign to…" picker on Boris Scheer and the "New offer" form as VP.
- The dev server was restarted twice earlier in the session, for the Tailwind config changes.
- The manual unassign of `EDM-2026-00773` (Madeleine Tilgner, by Lukas Becker) in the audit log was **not** made by this audit.
