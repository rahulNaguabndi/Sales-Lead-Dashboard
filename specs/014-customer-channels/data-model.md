# Data Model: F14

No schema changes (owned by F01). F14 reads/writes existing tables.

## Reads
- `customers`: all profile and preference fields, `is_returning`, `marketing_consent`.
- `purchases` (by `customer_id`): vehicle_model, amount (cents), purchased_at.
- `leads` (by `customer_id`): id, reference, stage, created_at, owner (name via join), scope check.
- Vehicle catalog (shared): display names for `{model}`.
- Offers (F15, optional): title/value for `offer_share`.

## Writes (PATCH preferences only)
- `customers`: preferred_channel, secondary_channel, best_time, language. (`search_text` unaffected.)
- `audit_log`: action `customer.preferences.update`, entity `customer`, before/after of the four fields.
- `activities`: one SYSTEM NOTE on the viewed lead, note "Preferences updated: <old> → <new>" (changed fields only), actor = user. All in one transaction.

## Derived / view types (shared)
- `TemplateKey`: `first_contact | follow_up | test_drive_invite | offer_share | callback_confirm`.
- `TemplateLang`: `de | fr | it | es | nl | pt | en`.
- `TemplateVars`: firstName, lastName, model, repName, repFirstName, dealership, offerTitle, offerValue, bestTime.
- `HistoryLead`: `{id, reference, stage, createdAt, ownerName, inScope:true}` or `{reference, stage, createdAt, inScope:false}`.
- Best-time windows: MORNING 08–12, AFTERNOON 12–17, EVENING 17–20, ANYTIME none.

## Validation
- PatchPreferences: at least one field; channels ∈ Channel enum; secondary ≠ preferred; bestTime ∈ BestTime; language ∈ supported ISO-639-1 set; `leadId` required.
