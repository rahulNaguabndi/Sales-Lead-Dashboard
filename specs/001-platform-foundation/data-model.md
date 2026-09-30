# Data Model: F01 — Platform Foundation

**Phase 1 output** | Date: 2026-09-30 | Source: `docs/03-domain-model.md`

F01 creates the **entire schema**. This document is the implementation reference; the canonical
authority is `docs/03-domain-model.md`. If they disagree, fix this file.

---

## Entity Relationship Summary

```
TEAMS ──< USERS ──< LEADS ──< ACTIVITIES (append-only)
                          ──< STAGE_HISTORY
                          ──< FOLLOW_UPS
CUSTOMERS >──< LEADS
CUSTOMERS ──< PURCHASES (linked by lead on WON)
OFFERS >──< LEADS (applied_offer_id, set on WON)
USERS ──< AUDIT_LOG (append-only)
```

---

## `teams`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | TEXT PK | ULID | |
| `name` | TEXT NOT NULL | | "Team DACH" |
| `region` | TEXT ENUM NOT NULL | DACH \| WEST \| SOUTH | |
| `countries` | JSON NOT NULL | `string[]` | ISO-3166 alpha-2 codes |
| `manager_id` | TEXT FK users | nullable | circular ref; enforced in app + seed order |
| `auto_assign` | INT BOOL NOT NULL | default 1 | |
| `assign_strategy` | TEXT ENUM NOT NULL | default LOAD_BALANCED | LOAD_BALANCED \| LANGUAGE_MATCH \| ROUND_ROBIN |
| `rr_cursor` | TEXT | nullable | last user id picked by round-robin |

**Seed values**: 3 teams — DACH (DE, AT, CH; LANGUAGE_MATCH), West (FR, BE, NL, LU;
LOAD_BALANCED), South (IT, ES, PT; ROUND_ROBIN).

---

## `users`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | TEXT PK | ULID | |
| `name` | TEXT NOT NULL | | |
| `email` | TEXT NOT NULL | unique, lowercase | |
| `password_hash` | TEXT NOT NULL | bcrypt | `demo1234` for all seed users |
| `role` | TEXT ENUM NOT NULL | REP \| MANAGER \| VP | |
| `manager_id` | TEXT FK users | nullable | null for VP (root) |
| `team_id` | TEXT FK teams | nullable | null for VP |
| `languages` | JSON NOT NULL | `string[]` | ISO-639-1 codes |
| `avatar_color` | TEXT NOT NULL | | hex or Tailwind color name |
| `is_active` | INT BOOL NOT NULL | default 1 | |
| `max_open_leads` | INT NOT NULL | default 25 | claim limit for REP |
| `last_assigned_at` | INT | nullable | unix ms; load-balancer tie-break |
| `token_version` | INT NOT NULL | default 0 | increment to revoke all sessions |
| `created_at` | INT NOT NULL | unix ms UTC | |

**Indexes**: `users_email_uq` (unique on email), `users_manager_idx` (manager_id).

**Seed**: 16 users — 1 VP (Isabelle Laurent), 3 managers, 12 reps per `docs/01-personas.md`.
Email: `firstname.lastname@eurodrive.test` (accents stripped).

---

## `customers`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | TEXT PK | ULID | |
| `first_name` | TEXT NOT NULL | | |
| `last_name` | TEXT NOT NULL | | |
| `email` | TEXT | nullable, indexed | normalized lowercase |
| `phone` | TEXT | nullable, indexed | E.164 format |
| `country` | TEXT NOT NULL | ISO-3166 alpha-2 | |
| `city` | TEXT | nullable | |
| `age` | INT | nullable | |
| `age_band` | TEXT ENUM NOT NULL | default UNKNOWN | 18-25 \| 26-35 \| 36-45 \| 46-60 \| 60+ \| UNKNOWN |
| `language` | TEXT NOT NULL | ISO-639-1 | |
| `preferred_channel` | TEXT ENUM NOT NULL | CALL \| WHATSAPP \| SMS \| EMAIL | |
| `secondary_channel` | TEXT ENUM | nullable | |
| `best_time` | TEXT ENUM NOT NULL | default ANYTIME | MORNING \| AFTERNOON \| EVENING \| ANYTIME |
| `is_returning` | INT BOOL NOT NULL | default 0 | stored; set by seed, F10 dedupe, F07 on WON |
| `marketing_consent` | INT BOOL NOT NULL | default 0 | GDPR placeholder |
| `search_text` | TEXT NOT NULL | default ''; indexed | lowercased, diacritics-stripped first+last+email+phone-digits |
| `created_at` | INT NOT NULL | unix ms UTC | |

**Constraints**: CHECK `email IS NOT NULL OR phone IS NOT NULL` (at least one contact).

**Indexes**: `customers_phone_idx`, `customers_email_idx`, `customers_search_idx`.

**Seed**: ≈600 customers across European countries in documented proportions. 20% are
returning customers with 1–2 historical purchases.

---

## `leads`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | TEXT PK | ULID | |
| `reference` | TEXT NOT NULL | unique | human-readable `EDM-YYYY-NNNNN` |
| `customer_id` | TEXT FK customers NOT NULL | | |
| `team_id` | TEXT FK teams NOT NULL | | |
| `owner_id` | TEXT FK users | nullable | null = unassigned pool |
| `source` | TEXT ENUM NOT NULL | | see §enums |
| `source_detail` | TEXT | nullable | campaign, portal name |
| `stage` | TEXT ENUM NOT NULL | default NEW | see stage machine |
| `vehicle_model` | TEXT | nullable | vehicle slug |
| `budget_min` | INT | nullable | euro cents |
| `budget_max` | INT | nullable | euro cents |
| `has_trade_in` | INT BOOL NOT NULL | default 0 | |
| `wants_finance` | INT BOOL NOT NULL | default 0 | |
| `test_drive_requested` | INT BOOL NOT NULL | default 0 | |
| `message` | TEXT | nullable | buyer's free text |
| `score` | INT NOT NULL | default 0 | 0–100 |
| `priority` | TEXT ENUM NOT NULL | default COOL | HOT \| WARM \| COOL |
| `score_breakdown` | JSON NOT NULL | | `{intent, source, customer, freshness, engagement}` |
| `attempt_count` | INT NOT NULL | default 0 | consecutive unanswered contact attempts |
| `deal_value` | INT | nullable | euro cents; set on WON |
| `applied_offer_id` | TEXT FK offers | nullable | |
| `lost_reason` | TEXT ENUM | nullable | PRICE \| BOUGHT_ELSEWHERE \| NOT_READY \| UNREACHABLE \| FINANCING_DECLINED \| OTHER |
| `lost_note` | TEXT | nullable | free text when lost_reason = OTHER |
| `first_response_at` | INT | nullable | unix ms; first contact activity (not NOTE) |
| `last_activity_at` | INT | nullable | unix ms; any USER activity incl. NOTE |
| `last_contact_at` | INT | nullable | unix ms; last contact activity (USER, type ≠ NOTE) |
| `assigned_at` | INT | nullable | unix ms |
| `closed_at` | INT | nullable | unix ms; set on WON or LOST |
| `created_at` | INT NOT NULL | unix ms UTC | |
| `updated_at` | INT NOT NULL | unix ms UTC | |
| `version` | INT NOT NULL | default 0 | optimistic concurrency |

**Indexes**: `leads_reference_uq` (unique), `leads_owner_stage_idx`, `leads_team_owner_idx`,
`leads_created_idx`, `leads_last_activity_idx`, `leads_stage_last_contact_idx`,
`leads_source_idx`, `leads_priority_score_idx`.

**Note**: `offers` must be declared before `leads` in `schema.ts` due to the FK reference.

**Seed**: ≈800 leads over 90 days. Stage distribution and source distribution per FR-034/FR-035.
At-risk / SLA-breach / hero leads per FR-037.

---

## `activities` (append-only)

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | TEXT PK | ULID | |
| `lead_id` | TEXT FK leads NOT NULL | | |
| `actor_id` | TEXT FK users | nullable | null for system |
| `kind` | TEXT ENUM NOT NULL | USER \| SYSTEM | |
| `type` | TEXT ENUM NOT NULL | | see §enums |
| `outcome` | TEXT ENUM | nullable | CONNECTED \| NO_ANSWER \| VOICEMAIL \| INTERESTED \| NOT_INTERESTED \| CALLBACK_REQUESTED |
| `note` | TEXT NOT NULL | default '' | 1–2000 chars for USER activities |
| `ai_assisted` | INT BOOL NOT NULL | default 0 | set by F18 prefill |
| `metadata` | JSON | nullable | e.g. `{from: "NEW", to: "CONTACTED"}` for stage changes |
| `created_at` | INT NOT NULL | unix ms UTC | |

**Append-only enforcement**: `BEFORE UPDATE` and `BEFORE DELETE` triggers raise `ABORT`.

**Indexes**: `activities_lead_time_idx` (lead_id, created_at).

**Contact activity rule**: kind = USER AND type ≠ NOTE. Notes never advance stage, never
set `first_response_at`, don't count toward coverage, leave `attempt_count` unchanged.

---

## `stage_history`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | TEXT PK | ULID | |
| `lead_id` | TEXT FK leads NOT NULL | | |
| `from_stage` | TEXT ENUM | nullable | null for initial NEW |
| `to_stage` | TEXT ENUM NOT NULL | | |
| `changed_by` | TEXT FK users | nullable | null = system/auto-cold |
| `reason` | TEXT | nullable | |
| `changed_at` | INT NOT NULL | unix ms UTC | |

**Indexes**: `stage_history_lead_time_idx` (lead_id, changed_at).

---

## `follow_ups`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | TEXT PK | ULID | |
| `lead_id` | TEXT FK leads NOT NULL | | |
| `assigned_to` | TEXT FK users NOT NULL | | |
| `due_at` | INT NOT NULL | unix ms | |
| `status` | TEXT ENUM NOT NULL | default PENDING | PENDING \| DONE \| MISSED \| CANCELLED |
| `note` | TEXT | nullable | |
| `created_by` | TEXT FK users | nullable | |
| `created_at` | INT NOT NULL | unix ms UTC | |
| `completed_at` | INT | nullable | unix ms |
| `completed_by_activity_id` | TEXT FK activities | nullable | |

**Indexes**: `follow_ups_assignee_status_due_idx` (assigned_to, status, due_at).

**Seed**: 30 overdue, 20 due today, 40 future follow-ups (FR-037).

---

## `offers`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | TEXT PK | ULID | |
| `title` | TEXT NOT NULL | | |
| `description` | TEXT NOT NULL | | |
| `discount_type` | TEXT ENUM NOT NULL | AMOUNT \| PERCENT \| APR \| GIFT | |
| `value` | INT | nullable | cents (AMOUNT), basis points (APR), null (GIFT) |
| `valid_from` | INT NOT NULL | unix ms | |
| `valid_to` | INT NOT NULL | unix ms | |
| `eligibility` | JSON NOT NULL | `OfferEligibility` | all keys optional, all present keys must match (AND logic) |
| `is_active` | INT BOOL NOT NULL | default 1 | |
| `created_by` | TEXT FK users | nullable | |
| `created_at` | INT NOT NULL | unix ms UTC | |

**Eligibility JSON shape**:
```json
{
  "customerType": "RETURNING" | "NEW" | "ANY",
  "models": ["aurora-suv"],
  "countries": ["DE", "AT"],
  "requiresTradeIn": true,
  "requiresFinance": true,
  "minBudget": 2500000,
  "sources": ["REFERRAL"]
}
```

**Seed**: 6 offers (5 active, 1 expired) per FR-038.

---

## `purchases`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | TEXT PK | ULID | |
| `customer_id` | TEXT FK customers NOT NULL | | |
| `lead_id` | TEXT FK leads | nullable | null for historical seed purchases |
| `vehicle_model` | TEXT NOT NULL | vehicle slug | |
| `amount` | INT NOT NULL | euro cents | |
| `purchased_at` | INT NOT NULL | unix ms UTC | |

**Indexes**: `purchases_customer_idx` (customer_id).

**Note**: Marking a lead WON inserts a `purchases` row (vehicle_model, deal_value) in the same
transaction (F07). This keeps `is_returning` detection consistent.

---

## `audit_log` (append-only)

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | TEXT PK | ULID | |
| `actor_id` | TEXT FK users | nullable | null for system/intake |
| `action` | TEXT NOT NULL | | e.g. "lead.assign", "lead.stage_change" |
| `entity` | TEXT NOT NULL | | table name, e.g. "leads" |
| `entity_id` | TEXT NOT NULL | | ULID of the affected row |
| `before` | JSON | nullable | state before mutation |
| `after` | JSON | nullable | state after mutation |
| `meta` | JSON | nullable | `{actorType, userAgent, method, strategy, …}` |
| `ip` | TEXT | nullable | |
| `created_at` | INT NOT NULL | unix ms UTC | |

**Append-only enforcement**: same triggers as `activities`.

**Indexes**: `audit_entity_idx` (entity, entity_id), `audit_created_idx` (created_at).

---

## Lead Stage State Machine

```
[*] → NEW → CONTACTED → QUALIFIED → TEST_DRIVE → NEGOTIATION → WON → [*]
                  ↘                         ↘            ↘
                   LOST (any open stage)     LOST          LOST
                  ↓
                  COLD (auto, any open stage) ← revive via contact activity → CONTACTED
                  LOST → CONTACTED (reopen, MANAGER/VP only)
```

**Rules** (implemented in `packages/shared/src/stage-machine.ts`):
- Backward moves between open stages are allowed (NEGOTIATION → QUALIFIED)
- First contact activity on a NEW lead → auto-advance to CONTACTED
- Contact activity on a COLD lead → revive to CONTACTED
- NOTE activity never advances stage, never sets `first_response_at`
- COLD target: SYSTEM or MANAGER/VP only
- LOST → CONTACTED reopen: MANAGER/VP only
- WON is terminal (no outgoing transitions except by MANAGER/VP reversal, which isn't in v1)

---

## Enums (in `packages/shared/src/enums.ts`)

| Enum | Values |
|---|---|
| `ROLES` | REP, MANAGER, VP |
| `ASSIGN_STRATEGIES` | LOAD_BALANCED, LANGUAGE_MATCH, ROUND_ROBIN |
| `LEAD_SOURCES` | WEBSITE, FACEBOOK, INSTAGRAM, GOOGLE_ADS, PORTAL, WALK_IN, PHONE, REFERRAL |
| `STAGES` | NEW, CONTACTED, QUALIFIED, TEST_DRIVE, NEGOTIATION, WON, LOST, COLD |
| `OPEN_STAGES` | NEW, CONTACTED, QUALIFIED, TEST_DRIVE, NEGOTIATION |
| `PRIORITIES` | HOT, WARM, COOL |
| `ACTIVITY_KINDS` | USER, SYSTEM |
| `USER_ACTIVITY_TYPES` | CALL, WHATSAPP, SMS, EMAIL, MEETING, TEST_DRIVE, NOTE |
| `SYSTEM_ACTIVITY_TYPES` | LEAD_CREATED, STAGE_CHANGED, ASSIGNED, CLAIMED, FOLLOW_UP_SCHEDULED, FOLLOW_UP_MISSED, AUTO_COLD, OFFER_APPLIED, SCORE_CHANGED |
| `OUTCOMES` | CONNECTED, NO_ANSWER, VOICEMAIL, INTERESTED, NOT_INTERESTED, CALLBACK_REQUESTED |
| `CHANNELS` | CALL, WHATSAPP, SMS, EMAIL |
| `BEST_TIMES` | MORNING, AFTERNOON, EVENING, ANYTIME |
| `AGE_BANDS` | 18-25, 26-35, 36-45, 46-60, 60+, UNKNOWN |
| `LOST_REASONS` | PRICE, BOUGHT_ELSEWHERE, NOT_READY, UNREACHABLE, FINANCING_DECLINED, OTHER |
| `FOLLOW_UP_STATUSES` | PENDING, DONE, MISSED, CANCELLED |
| `DISCOUNT_TYPES` | AMOUNT, PERCENT, APR, GIFT |
| `LANGUAGES` | de, fr, it, es, nl, pt, en, pl, da |

---

## Vehicle Catalog (`packages/shared/src/catalog.ts`)

| Slug | Name | Body | Fuel | Price (cents) |
|---|---|---|---|---|
| `aurora-suv` | Aurora SUV | SUV | Hybrid | 3,890,000 |
| `metro-hatch` | Metro Hatch | Hatch | Petrol | 2,150,000 |
| `vento-sedan` | Vento Sedan | Sedan | Diesel | 3,240,000 |
| `terra-4x4` | Terra 4x4 | 4x4 | Diesel | 5,490,000 |
| `luma-ev` | Luma EV | Hatch | Electric | 4,270,000 |
| `nova-van` | Nova Van | Van | Diesel | 3,620,000 |

---

## Source Groups (`packages/shared/src/source-groups.ts`)

| Group | Sources |
|---|---|
| WEBSITE | WEBSITE |
| SOCIAL | FACEBOOK, INSTAGRAM |
| PAID_SEARCH | GOOGLE_ADS |
| PORTALS | PORTAL |
| OFFLINE | WALK_IN, PHONE |
| REFERRAL | REFERRAL |

---

## Country → Team Region Mapping (`packages/shared/src/countries.ts`)

| Country | Region | Dial | Default lang |
|---|---|---|---|
| DE, AT, CH | DACH | +49, +43, +41 | de |
| FR, LU | WEST | +33, +352 | fr |
| BE, NL | WEST | +32, +31 | nl |
| IT | SOUTH | +39 | it |
| ES | SOUTH | +34 | es |
| PT | SOUTH | +351 | pt |
| PL, IE, DK | null (round-robin across teams) | +48, +353, +45 | pl, en, da |
