# Feature Specification: Customer Profile, Preferences & Channel Deep Links (F14)

**Feature Branch**: `014-customer-channels`

**Created**: 2026-09-30

**Status**: Draft

**Input**: User description: "F14 Customer Profile, Preferences & Channel Deep Links. On each lead, salespeople see a customer card (name, phone, email, city and country, age group, language, preferred and secondary contact channel, best time to contact). Returning customers are clearly marked with past purchases and past enquiries. The preferred channel is the most prominent action; one click opens that channel with a ready-made message in the customer's language, personalised with name, car, salesperson and any applicable offer. The activity form is pre-filled so the salesperson only confirms the outcome. Nothing is logged until they confirm. Channels lacking contact detail are disabled with a reason. A hint shows when it is outside the customer's preferred contact time, and preferences can be updated." Source of truth: `docs/features/F14-customer-channels.md`.

**Priority / Wave**: P1 / wave 3. **Depends on**: F05 (lead detail page and its left/right column slots), F06 (activity composer and its prefill capability). **Blocks**: F18 (AI draft reuses templates and channel logic).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Customer card (Priority: P1)

As a sales rep, I want the customer's key facts at a glance on the lead page, so I know who I'm dealing with before I reach out.

**Why this priority**: Every contact starts from knowing the customer; it is the base of the whole feature.

**Independent Test**: Open any seeded lead and check that the card shows the name, phone formatted for display, email, city with country flag, age band, language, a ★ on the preferred channel, the secondary channel, and the best time.

**Acceptance Scenarios**:

1. **Given** a lead for Giulia Conti (Italy, age 34, WhatsApp preferred, SMS secondary, evening, Italian), **Then** the card shows "Giulia Conti · Milan 🇮🇹 · 26–35 · Italian", the phone as "+39 347 123 4567" with a copy button, the email with a copy button, "Prefers WhatsApp · evenings", and "Also OK: SMS".
2. **Given** a customer with no email, **Then** the email row shows "—" and the Email channel button is disabled with the tooltip "No email on file".
3. **Given** a customer without marketing consent, **Then** a small "No marketing consent" badge appears.

---

### User Story 2 - Returning-customer history (Priority: P1)

As a rep, I want to see what a returning customer bought and enquired about before, so I can personalise the conversation.

**Why this priority**: Returning customers are the most valuable leads, and the rep must recognise them.

**Independent Test**: Open a seeded returning customer's lead and confirm the badge and the History card entries; open a new customer's lead and confirm the card is absent.

**Acceptance Scenarios**:

1. **Given** a customer with past purchases or leads, **Then** the header shows a "Returning customer" badge, and the History card lists past purchases (model, € amount, date, e.g. "Metro Hatch · 21.500 € · Mar 2021") and past leads (reference, stage, date, owner). Each past lead links to that lead if it is within my scope; otherwise it appears as read-only text.
2. **Given** a new customer, **Then** the History card is hidden.

---

### User Story 3 - Contact on the preferred channel (Priority: P1)

As a rep, I want to contact the customer on their preferred channel with a ready message, so I reach them the way they like with minimal effort.

**Why this priority**: This is the core value: a one-click, on-channel, pre-written touch that is easy to log.

**Independent Test**: On a WhatsApp-preferring lead, click the primary button. A new tab opens the WhatsApp chat link for the customer's number with the encoded message, and the activity form shows type WhatsApp with the message text in the note.

**Acceptance Scenarios**:

1. **Given** the channel bar, **Then** the preferred channel is the primary (filled) button marked with ★, and the other channels appear as outline buttons ordered secondary first, then the rest.
2. **When** I click WhatsApp, **Then** a template picker (default template preselected) shows a preview rendered in the customer's language; "Open WhatsApp" opens the deep link in a new tab **and** the activity form is pre-filled with type WhatsApp, note = rendered message, outcome empty and focused.
3. **When** I click Call, **Then** the phone-call link for the customer's number opens (dialer or softphone), and the activity form is pre-filled with type Call and the note "Called customer", with the outcome selector focused.
4. **When** I click SMS or Email, **Then** an SMS or email link opens with the rendered body (email also sets a subject), and the activity form is pre-filled likewise.
5. **Then** an activity is only saved when the rep submits the activity form (a deep link cannot confirm delivery).
6. **Given** the customer's current local time is outside their best time, **Then** a hint appears, e.g. "Customer prefers evenings (it's 10:15 in Milan)". The customer's timezone is derived from their country.

---

### User Story 4 - Multilingual templates with variables (Priority: P1)

As a rep, I want ready-made messages in the customer's own language, personalised for them, so I don't have to write or translate each one.

**Why this priority**: The message is what makes the one-click contact useful across a multi-country market.

**Independent Test**: Render every template in every language and confirm no unfilled placeholders remain.

**Acceptance Scenarios**:

1. **Then** templates exist in German, French, Italian, Spanish, Dutch, Portuguese and English, with the keys `first_contact`, `follow_up`, `test_drive_invite`, `offer_share`, `callback_confirm`.
2. **Then** the available variables are first name, last name, vehicle model (display name), rep name, rep first name, dealership ("EuroDrive Motors"), offer title, offer value (formatted €) and best time.
3. **Given** an unsupported customer language, **Then** the message falls back to English and the picker says "Template in English (no {language} template)".
4. **Given** the `offer_share` template and no applicable offer, **Then** that template is disabled.
5. **Then** the rep can switch the template language in the picker (e.g. a Swiss customer who writes in French).

---

### User Story 5 - Edit preferences (Priority: P2)

As a rep, I want to update a customer's contact preferences when the customer tells me, so future outreach respects them.

**Why this priority**: Valuable but the feature already delivers value with seeded preferences.

**Independent Test**: Change the preferred channel from WhatsApp to Call, save, and confirm the card, the channel bar order, the audit record and the timeline entry all reflect it.

**Acceptance Scenarios**:

1. **Given** the customer card, **When** the rep clicks "Edit preferences", **Then** they can change preferred channel, secondary channel, best time and language. Saving records an audit entry and a system note activity such as "Preferences updated: WhatsApp → Call".

---

### Edge Cases

- A phone number in legacy data that is not a valid international number: phone-based channels are disabled with the reason "Invalid phone number".
- A very long message plus link: the message is truncated to 1,000 characters (chat links accept about 2,000) and a warning is shown.
- A pop-up blocker prevents new tabs: channel actions are real links (new tab for WhatsApp, plain links for call/SMS/email), not script-opened windows.
- A desktop with no phone handler: clicking Call does nothing, so a copy-number button sits next to Call.
- Accented names in templates (Émile, João) are encoded correctly in links.
- A returning customer matched by email whose phone differs: history still shows; the card shows the stored phone; the newly submitted phone is recorded by intake on the lead-created activity.
- Preferences edited by a user with no write access to any of the customer's leads in their scope: refused.
- Past leads outside the caller's scope: shown redacted (reference, stage, date only).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a channel abstraction that, for a customer and channel, reports availability, builds a contact link from a message, and optionally sends a message. The first release provides link-based contact for all four channels (WhatsApp, call, SMS, email) and no direct sending, so real messaging vendors can be added later without changing callers.
- **FR-002**: Contact links MUST follow these formats:
  - WhatsApp: chat link on the number's digits without "+", with URL-encoded text.
  - Call: telephone link with the international number.
  - SMS: SMS link with the international number and URL-encoded body, in a form that works on both iOS and Android.
  - Email: mailto link with the address, URL-encoded subject and body.
- **FR-003**: Phone numbers MUST be stored in international (E.164) format and displayed in international format with spacing.
- **FR-004**: WhatsApp, call and SMS require a phone number; email requires an email address. Unavailable channels MUST be disabled with a visible reason.
- **FR-005**: Template rendering MUST be a deterministic function of template key, language and variables, returning an optional subject and a body. Unknown variables render as empty text and raise a developer-visible warning. Output is plain text with no markup.
- **FR-006**: Choosing a channel MUST pre-fill the activity form (type, note, and channel; not marked AI-assisted) through the prefill capability exposed on the lead detail page by F06.
- **FR-007**: Clicking a channel MUST NOT create any stored record (no phantom activities). Only a client-side analytics log is permitted.
- **FR-008**: The system MUST expose a customer profile with history (purchases and leads). Leads outside the caller's scope are redacted to reference, stage and created date.
- **FR-009**: The system MUST allow updating preferences only (preferred channel, secondary channel, best time, language), and only for callers with lead-write permission on at least one of the customer's leads within their scope.
- **FR-010**: The customer's timezone MUST be derived from country (DE/AT/CH/FR/BE/NL/LU/IT/ES → the country's capital's zone; PT → Lisbon). Best-time windows: morning 08–12, afternoon 12–17, evening 17–20.
- **FR-011**: The rep name in templates MUST come from the current user, and the model from the vehicle catalog's display name.

### Key Entities

- **Customer**: contact details (phone, email), country, city, age band, language, preferred and secondary channel, best time, marketing consent, returning flag.
- **Purchase**: a past vehicle purchase (model, amount, date) belonging to a customer.
- **Lead (history)**: a prior or current enquiry by the customer (reference, stage, date, owner); may be out of the viewer's scope.
- **Offer**: an applicable offer supplying title and value for the `offer_share` template (provided by F15).
- **Message template**: a keyed, per-language text with variables.
- **Channel link**: a generated href plus rendered message for one channel.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From opening a lead to the customer's messaging app being open with a pre-written message in their language takes at most 2 clicks.
- **SC-002**: The template set covers 7 languages × 5 keys (35 templates); an automated check confirms every key exists in every language and renders with no leftover placeholders.
- **SC-003**: Contact links for all 4 channels are verified correct by automated tests, including accented and special characters.
- **SC-004**: 100% of seeded returning customers show a History card with at least one entry.

## Assumptions

- The lead detail page (F05) provides slots for the left-column cards and the right-column channel bar; the activity form (F06) exposes a prefill capability. Until they merge, F14 codes against those interfaces.
- The customer schema already holds all needed preference fields (owned by the foundation feature); no schema change is required.
- Customer name, phone and email are not editable in v1, to protect duplicate detection integrity.
- Whether the showroom captures a secondary channel is out of scope here (coordinated with F13, optional).
- Offer data for the `offer_share` template comes from F15; without it that template is disabled.

## Out of Scope

- Real message sending, delivery receipts and inbound message sync.
- Template management UI.
- Full GDPR consent capture flows.
