# Feature Specification: Showroom Mini App (Lead Generation)

**Feature Branch**: `013-showroom-app`

**Created**: 2026-09-30

**Status**: Draft

**Input**: User description: "F13 Showroom Mini App (lead generation). Source: docs/features/F13-showroom-app.md"

## Clarifications

### Session 2026-09-30

- Q: What does the buyer see when the service silently accepts a bot submission (honeypot, no reference returned)? → A: The normal thank-you page with generic copy and no reference.
- Q: How are unsupported-media (415) and other unexpected statuses handled? → A: Same as a server error: the retry banner with all input kept.
- Q: How does a budget range map to minimum/maximum cents? → A: Each range sets both bounds in euro cents; the open-ended "< 20k" omits the minimum and "55k+" omits the maximum.
- Q: When is a new idempotency key generated? → A: Each time the enquiry form is opened or after a successful submission; retries after a failure reuse the current key.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse and enquire (Priority: P1)

As a car buyer, I want to pick a model and tell the dealership I'm interested in under a minute so that they contact me. The public site of the fictional dealership "EuroDrive Motors" is separate from the internal lead desk and sends enquiries to the lead desk's public enquiry service.

**Why this priority**: It is the core purpose of the feature; it makes "incoming leads" real.

**Independent Test**: With the mock enquiry mode on, submit a valid enquiry and see the thank-you page with a reference number.

**Acceptance Scenarios**:

1. **Given** the home page, **Then** I see a hero banner and a grid of 6 vehicles (name, body type, fuel, price formatted like "38.900 €").
2. **When** I click "I'm interested" on Aurora SUV, **Then** an enquiry panel opens with the model preselected.
3. **Given** I fill in the required fields (first and last name, email or phone, country, language, preferred channel), **When** I submit, **Then** I see a thank-you page: "Thanks Anna! Your reference is EDM-2026-00812. We'll contact you via WhatsApp in the evening, in German."

---

### User Story 2 - Express contact preferences (Priority: P1)

As a buyer, I want to choose how, when, and in which language I'm contacted so that the dealer respects my preferences.

**Why this priority**: Preferences drive routing and follow-up quality in the lead desk.

**Independent Test**: Select each channel and verify which contact detail becomes required.

**Acceptance Scenarios**:

1. **Given** the form, **Then** I can choose the preferred channel (WhatsApp, Phone call, SMS, Email) as large selectable tiles, the best time (Morning, Afternoon, Evening, Anytime), and the language (defaulting from the selected country).
2. **Given** I pick WhatsApp, SMS or Call, **Then** phone becomes required. **Given** Email, **Then** email becomes required.

---

### User Story 3 - Helpful validation and errors (Priority: P1)

As a buyer, I want clear feedback when something's wrong so that I can fix it without losing what I typed.

**Why this priority**: Silent failures would lose real leads.

**Independent Test**: Simulate each failure response and check the message and preserved input.

**Acceptance Scenarios**:

1. **Given** an invalid email, **When** I leave the field, **Then** an inline error appears under it.
2. **Given** the service reports field-level errors, **Then** each error shows next to its field and focus moves to the first invalid field.
3. **Given** a network failure or a server error, **Then** a banner says "We couldn't send your enquiry. Please try again." with a Retry button, and all fields keep their values.
4. **Given** the service says there were too many enquiries, **Then** the banner says "Too many enquiries from this device. Please try again in a minute."
5. **Given** the service rejects the site's client key, **Then** the banner says "The enquiry service is misconfigured," and the developer console logs a hint to check the configured key.

---

### User Story 4 - Demo toolbar (Priority: P1)

As the presenter, I want to choose which marketing funnel a lead came from and quickly fill realistic data so that the live demo is fast and shows different sources.

**Why this priority**: It is what makes the live demo show leads from different funnels.

**Independent Test**: Choose a source, prefill, submit, and inspect the submitted data.

**Acceptance Scenarios**:

1. **Given** the demo toolbar (a slim dark bar pinned at the top labelled "Demo controls"), **When** I choose "Came from: Instagram ad (campaign autumn-suv)", **Then** the next submission has source Instagram and source detail "autumn-suv".
2. **When** I click "Prefill random buyer", **Then** the form fills with a realistic European buyer (name, city, phone valid for the country, language, channel matching age) plus random intent flags.
3. **Given** the toolbar is switched off in configuration, **Then** the toolbar is hidden.

---

### User Story 5 - Model detail page (Priority: P2)

As a buyer, I want to view a model's key facts before enquiring.

**Why this priority**: Nice-to-have; enquiry works from the grid alone.

**Independent Test**: Open a model page directly by its address.

**Acceptance Scenarios**:

1. **When** I open `/models/luma-ev`, **Then** I see an illustration, the price, the fuel, three highlights, and an "I'm interested" button.

---

### Edge Cases

- Both email and phone empty: the form-level error "Please give us an email or phone number."
- A phone typed with a leading `+` or `00`: the duplicated dial code is stripped before combining. Server normalization is authoritative.
- Country changed after typing the phone: the dial code updates, the digits are kept.
- The user closes the enquiry panel mid-typing: the draft is kept in memory until the page reloads.
- The lead desk is down: network error banner with Retry.
- A honeypot field filled by a bot: the client still submits and the server rejects it silently; there is no client hint.
- Very long names or messages: limits are enforced with counters.
- A mobile viewport (≥ 360 px wide): the enquiry panel becomes a full-screen sheet.
- Unknown address: a 404 page with a link home.
- Reload of the thank-you page without navigation state: the reference is shown from the address plus generic copy.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The showroom MUST be a standalone public site, separate from the staff app, with its own pages: home, model detail (`/models/:slug`), and thank-you (`/thank-you`). An unknown route shows a 404 page with a link home.
- **FR-002**: The vehicle catalog MUST come from the shared catalog used across the platform. Prices are formatted with the shared euro formatter.
- **FR-003**: Vehicle imagery MUST be local (a per-model illustration with a gradient). No external image hosts, so the demo works offline.
- **FR-004**: The home page MUST offer body type filters (All, SUV, Hatch, Sedan, 4x4, Van) and fuel filters (All, Petrol, Diesel, Hybrid, Electric), applied client-side.
- **FR-005**: The enquiry form MUST collect fields mapped exactly to the shared enquiry contract:
  - First name*, last name* (1–60 chars).
  - Email: required if the channel is Email, or if there is no phone.
  - Phone (country dial-code select + number), combined into international format: required if the channel is Call/WhatsApp/SMS, or if there is no email.
  - Country* (EU list from the shared countries), which sets the default dial code and language.
  - City (≤ 80).
  - Age group: optional, defaults to unknown.
  - Preferred language*: default from country.
  - Preferred channel* (tile selector).
  - Best time: default Anytime.
  - Model: preselected from the card; "Not sure yet" means omitted.
  - Budget range (< 20k, 20–30k, 30–40k, 40–55k, 55k+), converted to euro cents minimum/maximum.
  - Checkboxes: has a car to trade in / interested in financing / would like a test drive.
  - Message (≤ 2000 chars, counter shown after 1,800).
  - Marketing consent checkbox (unchecked by default, GDPR placeholder copy).
  - A hidden honeypot field, visually hidden, unreachable by keyboard, with autocomplete off.
- **FR-006**: Client validation MUST use the shared enquiry contract plus the channel-specific requirement in FR-005. The server's field-error map (path → message) MUST be mapped onto the form fields.
- **FR-007**: Submission MUST send JSON to the configured enquiry address with the client key header, a unique idempotency key generated when the form opens, and a 10-second timeout.
- **FR-008**: The submit button MUST be disabled with a spinner while in flight (prevents double submission). A retry reuses the same idempotency key.
- **FR-009**: On success, the response MUST be validated against the shared response contract, and the buyer taken to the thank-you page with the reference and a preferences summary (also with the reference in the address). Refreshing the thank-you page without navigation state shows the reference from the address plus generic copy. A "duplicate" response is shown as a normal thank-you.
- **FR-010**: Errors MUST be mapped per User Story 3, plus: 413 (payload too large) shows a message that the enquiry is too large, and a timeout shows "The request timed out".
- **FR-011**: The demo toolbar MUST offer the "Came from" options: Website (direct), Facebook ad (+campaign), Instagram ad (+campaign), Google ad (+keyword), Referral (+referrer name), Portal (mobile.de / AutoScout24). Detail text is editable and prefilled with a sensible default. The selection persists across reloads in the browser.
- **FR-012**: "Prefill random buyer" MUST generate locale-correct data for a random supported country, with an age-band-correlated channel preference, consistent with F01 FR-033. The data generator is loaded only when the toolbar is used.
- **FR-013** (P2): A "Submit 5 random enquiries" toolbar action MUST send 5 prefilled enquiries 1.5 s apart and show a small log of the returned references.
- **FR-014**: A mock enquiry mode MUST short-circuit the network call and return a fake reference after 600 ms, so the showroom can be built and tested before the intake service exists. It MUST be off by default in the example configuration.
- **FR-015**: Configuration MUST provide: enquiry address (default `http://localhost:3000/api/intake/leads`), client key (`showroom-dev-key`), toolbar visibility (default on), and mock mode (default off), documented in an example env file.
- **FR-016** (cross-feature requirement on F10): The intake endpoint MUST answer CORS preflight for the showroom origin with methods POST/OPTIONS and headers Content-Type, X-API-Key, Idempotency-Key, and MUST honour the idempotency key per F10 FR-019 (a replay within 24 h returns 200 with the original reference and no new lead). F10 also applies a 10-minute implicit duplicate window that returns the existing reference. This spec only records the requirement; it is implemented in F10.
- **FR-017**: Accessibility: every input has a label, errors are programmatically linked to their fields, tiles are radio groups operable with the keyboard, and the thank-you heading receives focus on navigation.

### Key Entities

- **Enquiry (IntakeLead)**: The buyer's submission: identity, contact details, preferences, vehicle interest, budget, intent flags, consent, source and source detail. Defined in the shared contract.
- **Enquiry response (IntakeResponse)**: reference, status (created or duplicate), first name of the assigned rep (or none), expected contact channel and best time.
- **Vehicle**: catalog model (slug, name, body type, fuel, price) from the shared catalog.
- **Country**: EU country with dial code and default language, from the shared list.
- **Traffic source selection**: demo-only choice of source plus detail, the only locally persisted data.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time user completes an enquiry in under 60 seconds; the presenter, using "Prefill", in under 10 seconds.
- **SC-002**: With the intake and live-update features running, the lead appears in the correct staff inbox less than 2 seconds after submitting (verified end-to-end across both apps, once those features exist).
- **SC-003**: 100% of server validation errors map to a visible field or banner message (no silent failures).
- **SC-004**: The showroom's production bundle is under 250 KB compressed, with the random-data generator loaded only on demand.
- **SC-005**: Accessibility audit score of at least 95 on the home page and the form.

## Assumptions

- F01 provides the showroom scaffold, the shared enquiry contract, vehicle catalog and countries; F10 provides the intake service (mocked until then).
- The client key is a channel identifier, not a secret; protection comes from CORS, rate limiting, the honeypot and validation.
- UI copy is English only; the buyer's preferred language is captured, not localized.
- Out of scope: real inventory, configurator, payments, buyer accounts, chat widget, appointment calendar, a proxy to hide the client key, "Similar offers" (offers are staff-side, F15).
- The burst action lives in both the showroom and the F10 simulator.
- Brand: warm neutral palette distinct from the staff app; the demo toolbar (36 px, dark, amber "DEMO" tag) is never mistakable for site UI.
