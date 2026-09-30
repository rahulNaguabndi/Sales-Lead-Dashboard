# F13 — Showroom Mini App (Lead Generation)

| Field | Value |
|---|---|
| **ID** | F13 |
| **Priority** | P1 |
| **Build wave** | 1 (built against the shared intake contract; the end-to-end test needs F10 in wave 2) |
| **Depends on** | F01 (showroom scaffold, `@leaddesk/shared` intake contract, vehicle catalog, countries) |
| **Blocks** | — (the headline demo moment needs F10 + F12) |
| **Personas** | BUYER (Anna Schmidt), and the presenter |
| **Challenge req.** | — (makes "incoming leads" real for R1) |
| **Owns (files/areas)** | `apps/showroom/src/**`, `apps/showroom/.env.example`, `apps/showroom/index.html` |

## 1. Summary
A small, separate public website for the fictional dealership **EuroDrive Motors**, running on its own port (:3001). Visitors browse six models and submit an **"I'm interested"** enquiry, with contact preferences, language, budget, trade-in, finance and test-drive wishes. The form posts to the web app's public **intake API** with an API key, exactly as a real external website or ad platform would. A clearly separated **demo toolbar** lets the presenter pick the traffic source ("came from" Facebook ad, Google ad…) and prefill a random European buyer, so the demo shows leads from different funnels arriving live in the lead desk.

## 2. User Stories & Acceptance Scenarios

### US-1 (P1): Browse and enquire
*As a car buyer, I want to pick a model and tell the dealership I'm interested in under a minute so that they contact me.*

**Independent test:** With `VITE_MOCK_INTAKE=true`, submit a valid enquiry and see the thank-you page with a reference number.

1. **Given** the home page, **Then** I see a hero banner and a grid of 6 vehicles (name, body type, fuel, price formatted "38.900 €").
2. **When** I click "I'm interested" on Aurora SUV, **Then** an enquiry panel opens with the model preselected.
3. **Given** I fill in the required fields (first and last name, email or phone, country, language, preferred channel), **When** I submit, **Then** I see a thank-you page: "Thanks Anna! Your reference is EDM-2026-00812. We'll contact you via WhatsApp in the evening, in German."

### US-2 (P1): Express contact preferences
*As a buyer, I want to choose how, when, and in which language I'm contacted so that the dealer respects my preferences.*

1. **Given** the form, **Then** I can choose the preferred channel (WhatsApp, Phone call, SMS, Email) as large selectable tiles, the best time (Morning, Afternoon, Evening, Anytime), and the language (defaulting from the selected country).
2. **Given** I pick WhatsApp or SMS or Call, **Then** phone becomes required. **Given** Email, **Then** email becomes required.

### US-3 (P1): Helpful validation and errors
*As a buyer, I want clear feedback when something's wrong so that I can fix it without losing what I typed.*

1. **Given** an invalid email, **When** I leave the field, **Then** an inline error appears under it.
2. **Given** the server returns 400 with field details, **Then** each error shows next to its field and focus moves to the first invalid field.
3. **Given** a network failure or 5xx, **Then** a banner says "We couldn't send your enquiry. Please try again." with a Retry button, and all fields keep their values.
4. **Given** 429, **Then** the banner says "Too many enquiries from this device. Please try again in a minute."
5. **Given** 401 (bad API key), **Then** the banner says "The enquiry service is misconfigured," and the console logs a hint to check `VITE_INTAKE_API_KEY`.

### US-4 (P1): Demo toolbar
*As the presenter, I want to choose which marketing funnel a lead came from and quickly fill realistic data so that the live demo is fast and shows different sources.*

1. **Given** the demo toolbar (a slim dark bar pinned at the top labelled "Demo controls"), **When** I choose "Came from: Instagram ad (campaign autumn-suv)", **Then** the next submission has `source=INSTAGRAM`, `sourceDetail="autumn-suv"`.
2. **When** I click "Prefill random buyer", **Then** the form fills with a realistic European buyer (name, city, E.164 phone for the country, language, channel matching age) plus random intent flags.
3. **Given** `VITE_SHOW_DEMO_TOOLBAR=false`, **Then** the toolbar is hidden.

### US-5 (P2): Model detail page
*As a buyer, I want to view a model's key facts before enquiring.*

1. **When** I open `/models/luma-ev`, **Then** I see an illustration, the price, the fuel, three highlights, and an "I'm interested" button.

## 3. Functional Requirements
- **FR-001**: The showroom MUST be a standalone Vite + React + TS + Tailwind app on port 3001 with its own `index.html`, using `react-router-dom` routes: `/`, `/models/:slug`, `/thank-you`. An unknown route shows a 404 page with a link home.
- **FR-002**: The vehicle catalog MUST come from `@leaddesk/shared` `VEHICLES`. Prices are formatted with the shared `formatEUR`.
- **FR-003**: Vehicle imagery MUST be local (inline SVG silhouettes with a gradient per model). No external image hosts, so the demo works offline.
- **FR-004**: Home page filters: body type chips (All, SUV, Hatch, Sedan, 4x4, Van) and fuel chips (All, Petrol, Diesel, Hybrid, Electric). Client-side only.
- **FR-005**: Enquiry form fields, mapped exactly to `IntakeLeadSchema`:

| UI field | Payload field | Rules |
|---|---|---|
| First name*, Last name* | firstName, lastName | 1–60 chars |
| Email | email | required if channel = EMAIL, or if no phone |
| Phone (country dial-code select + number) | phone | combined to `+<dial><digits>`; required if channel ∈ CALL/WHATSAPP/SMS, or if no email |
| Country* (select, EU list from `COUNTRIES`) | country | sets the default dial code and language |
| City | city | ≤ 80 |
| Age group | ageBand | optional, defaults to UNKNOWN |
| Preferred language* | language | default from country |
| How should we contact you?* | preferredChannel | tile selector |
| Best time | bestTime | default ANYTIME |
| Model | vehicleModel | preselected from the card; "Not sure yet" → omitted |
| Budget (range select: < 20k, 20–30k, 30–40k, 40–55k, 55k+) | budgetMin/budgetMax | converted to cents |
| I have a car to trade in / I'm interested in financing / I'd like a test drive | hasTradeIn / wantsFinance / testDriveRequested | checkboxes |
| Message | message | ≤ 2000, counter shown after 1,800 |
| Marketing consent checkbox (unchecked by default) | marketingConsent | GDPR placeholder copy |
| Hidden honeypot `website` | website | visually hidden, `tabIndex=-1`, `autocomplete=off` |

- **FR-006**: Client validation MUST use the shared `IntakeLeadSchema` (plus the channel-specific requirement in FR-005) through `react-hook-form` + `zodResolver`. The server's 400 `error.fields` map (path → message) is mapped onto the form fields.
- **FR-007**: Submission MUST `POST` JSON to `VITE_INTAKE_URL` with headers `Content-Type: application/json`, `X-API-Key: VITE_INTAKE_API_KEY`, `Idempotency-Key: <uuid generated when the form opens>`, and a 10 s timeout (AbortController).
- **FR-008**: The submit button MUST be disabled with a spinner while in flight (prevents double submission). A retry reuses the same Idempotency-Key.
- **FR-009**: On 201, parse with `IntakeResponseSchema` and navigate to `/thank-you` with the reference and a preferences summary in router state (and `?ref=` in the URL). Refreshing the thank-you page without state shows the reference from the query plus generic copy.
- **FR-010**: Error mapping per US-3 (400, 401, 413, 429, network or 5xx, timeout → "The request timed out").
- **FR-011**: The demo toolbar MUST offer the "Came from" options: Website (direct) → WEBSITE, Facebook ad → FACEBOOK (+campaign), Instagram ad → INSTAGRAM (+campaign), Google ad → GOOGLE_ADS (+keyword), Referral → REFERRAL (+referrer name), Portal → PORTAL (mobile.de / AutoScout24). Campaign/detail text is editable and prefilled with a sensible default. The selection persists in `localStorage`.
- **FR-012**: "Prefill random buyer" MUST generate locale-correct data for a random supported country (using `@faker-js/faker` locales) with age-band-correlated channel preference, consistent with F01 FR-033.
- **FR-013**: A "Submit 5 random enquiries" toolbar action (P2) MUST send 5 prefilled enquiries 1.5 s apart and show a small log of the returned references.
- **FR-014**: `VITE_MOCK_INTAKE=true` MUST short-circuit the network call and return a fake reference after 600 ms, so F13 can be built and tested before F10 exists. It MUST be false in `.env.example`.
- **FR-015**: Env (`apps/showroom/.env.example`): `VITE_INTAKE_URL=http://localhost:3000/api/intake/leads`, `VITE_INTAKE_API_KEY=showroom-dev-key`, `VITE_SHOW_DEMO_TOOLBAR=true`, `VITE_MOCK_INTAKE=false`.
- **FR-016 (cross-feature requirement on F10)**: The intake endpoint MUST answer CORS preflight for origin `SHOWROOM_ORIGIN` with methods `POST, OPTIONS` and allowed headers `Content-Type, X-API-Key, Idempotency-Key`, and MUST honour `Idempotency-Key` per F10 FR-019: a replay of the same key within 24 h returns 200 with the original reference and no new lead. Separately, F10 applies a 10-minute implicit duplicate window (same customer + same vehicle model + open lead), which also returns the existing reference.
- **FR-017**: Accessibility: every input has a label, errors are linked via `aria-describedby`, tiles are radio groups operable with the keyboard, and the thank-you heading receives focus on navigation.

## 4. Key Entities & Data
No local persistence except the demo-toolbar preference in `localStorage`. The payload follows `IntakeLead` (`@leaddesk/shared`). The response follows `IntakeResponse` `{ reference, status: "created" | "duplicate", assignedTo: { firstName } | null, expectedContact: { channel, bestTime } }` (F01 §9.2 / F10 §9). Catalog and countries come from shared.

## 5. Edge Cases & Error Handling
- Both email and phone empty → the form-level error "Please give us an email or phone number."
- A phone typed with a leading `+` or `00` → strip the dial-code duplication before combining. Server normalization is authoritative (F10).
- Country changed after typing the phone → the dial code updates, the digits are kept.
- The user closes the enquiry panel mid-typing → the draft is kept in memory until the page reloads.
- The web app is down → network error banner with Retry.
- The honeypot filled by a bot → the client still submits and the server rejects it silently (F10 decides the response). There's no client hint.
- Very long names or messages → limits enforced with counters.
- A mobile viewport (≥ 360 px) → the enquiry panel becomes a full-screen sheet.

## 6. Success Criteria
- **SC-001**: A first-time user completes an enquiry in < 60 s. The presenter, using "Prefill", does it in < 10 s.
- **SC-002**: With F10 and F12 running, the lead appears in the correct staff inbox < 2 s after submitting (end-to-end check with Playwright across both apps).
- **SC-003**: 100% of the server validation errors map to a visible field or banner message (no silent failures).
- **SC-004**: The showroom's production bundle is < 250 KB gzipped (faker is loaded lazily only when the demo toolbar is used).
- **SC-005**: Lighthouse accessibility score ≥ 95 on the home page and the form.

## 7. UX Notes
- Brand: "EuroDrive Motors" wordmark, a warm neutral palette distinct from the staff app (so viewers see it's a *different* site). Hero: "Find your next drive" with a CTA that scrolls to the grid.
- Grid cards: SVG illustration, name, body · fuel badges, "from 38.900 €", and an "I'm interested" primary button.
- Enquiry panel: a right-side sheet (desktop) in three visual groups: *About you* · *How to reach you* · *What you're looking for*. A sticky footer holds the submit button.
- The thank-you page repeats the reference in a monospace pill with a copy button, plus "What happens next" in 3 steps.
- Demo toolbar: 36 px, dark, amber "DEMO" tag. It holds the source select, the detail input, Prefill, and Submit ×5. It's never mistaken for the real site UI.

## 8. Decisions
| # | Decision | Alternatives | Rationale |
|---|---|---|---|
| D1 | A separate Vite app | A page inside the Next.js app | A real integration boundary (API key, CORS, public contract), per D7 in the overview |
| D2 | The API key is shipped to the browser, as a **channel identifier, not a secret** | A backend-for-frontend proxy | Honest for a public web form. Protection comes from CORS, rate limiting, the honeypot, and validation. BFF is documented as hardening |
| D3 | Reuse the shared Zod schema on the client | A duplicated form schema | One contract, and no client/server drift |
| D4 | A demo toolbar for the source and prefill | Separate landing pages per campaign | Fast, explicit demo control, and it can be switched off |
| D5 | Inline SVG imagery | Stock photos | Offline-safe, no licensing issues, small |
| D6 | Mock intake mode | Wait for F10 | Lets wave-1 work proceed in parallel |
| D7 | An Idempotency-Key header | Rely on dedupe only | Retries after timeouts don't create duplicate leads |

## 9. Technical Plan Input (for `/speckit.plan`)

**Structure** (`apps/showroom/src`)
```
main.tsx, App.tsx (router)
pages/Home.tsx, pages/ModelDetail.tsx, pages/ThankYou.tsx, pages/NotFound.tsx
components/VehicleCard.tsx, VehicleArt.tsx (SVG per slug), Filters.tsx
components/enquiry/EnquirySheet.tsx, EnquiryForm.tsx, ChannelTiles.tsx, PhoneInput.tsx, BudgetSelect.tsx
components/demo/DemoToolbar.tsx, prefill.ts (lazy faker import), burst.ts
lib/intake-client.ts   (submitEnquiry(payload, idempotencyKey) → Result<IntakeResponse, IntakeError>)
lib/env.ts             (zod-validated import.meta.env)
```

**Intake client contract**
```ts
type IntakeError =
  | { kind: 'validation'; fields: { path: string; message: string }[] }
  | { kind: 'unauthorized' } | { kind: 'rate_limited'; retryAfterSec?: number }
  | { kind: 'too_large' } | { kind: 'timeout' } | { kind: 'network' } | { kind: 'server'; status: number };
export async function submitEnquiry(p: IntakeLead, key: string): Promise<{ ok: true; data: IntakeResponse } | { ok: false; error: IntakeError }>;
```
Request: `POST {VITE_INTAKE_URL}` · body `IntakeLead` JSON. Responses expected from F10: `201 IntakeResponse` (status `created`) · `200 IntakeResponse` (status `duplicate`: an idempotent replay or implicit duplicate, shown as a normal thank-you) · `202 {status:'accepted'}` (honeypot) · `400 {error:{code:'VALIDATION_ERROR',fields}}` · `401 {error:{code:'UNAUTHORIZED_CLIENT'}}` · `413` · `415` · `429` (+`Retry-After`).

**Dependencies:** react-router-dom, react-hook-form, @hookform/resolvers, zod, @leaddesk/shared, @faker-js/faker (dynamic import), tailwind.

**Tests**
- Vitest + Testing Library: required-field validation; channel-dependent phone/email requirement; server 400 mapped to fields; the 429, 401, and network banners; the button disabled during flight; the same Idempotency-Key on retry; the budget range → cents mapping; the phone combination (`+49` + `151 1234 5678` → `+4915112345678`); the demo toolbar source → payload mapping.
- Mock mode: submit → thank-you with a reference.
- Playwright (wave 2+, with the web app running): submit from the showroom → the lead appears in the persona inbox (shared with F12's e2e).

## 10. Out of Scope
- Real vehicle inventory, configurator, pricing engine, or payments.
- Buyer accounts, chat widget, or appointment booking calendar.
- Localization of the showroom UI (English copy. The buyer's *preferred* language is captured).
- A BFF proxy to hide the API key (documented hardening).

## 11. Open Questions
- Should the showroom display "Similar offers" (for example Trade-in Boost) to the buyer? Proposed: no for v1. Offers are staff-side (F15).
- Should the burst action live in the showroom or only the CLI simulator (F10)? Proposed: both. The showroom is more visual during the demo.

## 12. Spec Kit Prompts
**`/speckit.specify`**
> Build a small public website for the fictional dealership "EuroDrive Motors", separate from the internal lead desk. Visitors browse six car models (filterable by body type and fuel, with euro prices) and can open a model page. From any model they can send an "I'm interested" enquiry with their name, email and/or phone, country and city, age group, preferred language, preferred contact channel (WhatsApp, phone call, SMS or email) and best time, budget range, trade-in, financing and test-drive wishes, a message, and marketing consent. The contact detail matching the chosen channel is required. The enquiry is sent to the lead desk's public enquiry service, and the visitor sees a thank-you page with a reference number and a summary of how they'll be contacted. Errors (invalid fields, too many requests, service unavailable) are explained clearly without losing input, and retries never create duplicate enquiries. For demos, a clearly separated toolbar lets the presenter choose which marketing channel the visit "came from" (website, Facebook, Instagram, Google ad, referral, car portal, with a campaign name), prefill a realistic random European buyer, and send a burst of enquiries.

**`/speckit.plan`**
> `apps/showroom`: Vite + React + TypeScript + Tailwind on port 3001, react-router-dom (`/`, `/models/:slug`, `/thank-you`), react-hook-form + zodResolver using `IntakeLeadSchema`, `VEHICLES`, `COUNTRIES` and `formatEUR` from `@leaddesk/shared`. Inline SVG vehicle art. `lib/intake-client.ts` POSTs to `VITE_INTAKE_URL` with `X-API-Key` and `Idempotency-Key` headers and a 10 s AbortController timeout, returning a typed error union mapped to field and banner errors. A demo toolbar (source/sourceDetail select persisted in localStorage, faker-based prefill with lazy import, a burst of 5), hidden by `VITE_SHOW_DEMO_TOOLBAR=false`. `VITE_MOCK_INTAKE` mode for development before the intake API exists. Vitest + Testing Library tests per F13 §9. The CORS and idempotency requirements are handed to F10 (FR-016). Only touch `apps/showroom/src/**` and the showroom env/index files.
