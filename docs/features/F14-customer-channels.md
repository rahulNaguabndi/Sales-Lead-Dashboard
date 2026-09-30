# F14 — Customer Profile, Preferences & Channel Deep Links

| Field | Value |
|---|---|
| **ID** | F14 |
| **Priority** | P1 |
| **Build wave** | 3 |
| **Depends on** | F05 (detail page slots: left column cards, right column channel bar), F06 (composer prefill API) |
| **Blocks** | F18 (the AI draft reuses the templates and channel logic) |
| **Personas** | REP, MANAGER, BUYER (indirectly) |
| **Challenge req.** | — (enriches R2 details) |
| **Owns (files/areas)** | `apps/web/server/channels/**`, `apps/web/components/leads/customer/**`, `apps/web/components/leads/channels/**`, `packages/shared/src/templates.ts` (append-only), `apps/web/app/api/customers/[id]/route.ts`, `apps/web/app/api/leads/[id]/contact-link/route.ts` |

## 1. Summary
It shows the rep **who the customer is**: contact details, age band, city, language, preferred and secondary channel, best time to contact, and, for returning customers, their past leads and purchases. It lets the rep **reach them on their preferred channel in one click**. A `ChannelAdapter` builds a deep link (`wa.me`, `tel:`, `sms:`, `mailto:`) with a message template rendered in the customer's language. Clicking also pre-fills the activity composer so the touch gets logged. Real messaging vendors can be plugged in later behind the same adapter.

## 2. User Stories & Acceptance Scenarios

### US-1 (P1): Customer card
*As a rep, I want the customer's key facts at a glance.*

**Independent test:** Open any seeded lead and check that the card shows the name, E.164 phone formatted for display, email, city and country flag, age band, language, a ★ preferred channel, secondary channel, and best time.

1. **Given** a lead for Giulia Conti (IT, 34, WhatsApp ★, SMS secondary, evening, it), **Then** the card shows "Giulia Conti · Milan 🇮🇹 · 26–35 · Italian", the phone as "+39 347 123 4567" (copy button), the email (copy button), "Prefers WhatsApp · evenings", and "Also OK: SMS".
2. **Given** a customer with no email, **Then** the email row shows "—" and the Email channel button is disabled with the tooltip "No email on file".
3. **Given** `marketing_consent = false`, **Then** a small "No marketing consent" badge appears (a GDPR placeholder).

### US-2 (P1): Returning-customer history
1. **Given** a customer with past purchases or leads, **Then** the header shows a **"Returning customer"** badge, and the History card lists past purchases (model, € amount, date, e.g. "Metro Hatch · 21.500 € · Mar 2021") and past leads (reference, stage, date, owner), each linking to that lead if it's in my scope (otherwise it shows as read-only text).
2. **Given** a new customer, **Then** the History card is hidden.

### US-3 (P1): Contact on the preferred channel
*As a rep, I want to contact the customer on their preferred channel with a ready message.*

**Independent test:** On a WhatsApp-preferring lead, click the primary button. A new tab opens `https://wa.me/39347...?text=Ciao%20Giulia...`, and the composer shows type=WhatsApp with the template text in the note.

1. **Given** the channel bar, **Then** the **preferred channel is the primary (filled) button with ★**, and the others are outline buttons in the order secondary → rest.
2. **When** I click WhatsApp, **Then** a template picker (default template preselected) shows a preview rendered in the customer's language. "Open WhatsApp" opens the deep link in a new tab **and** the composer is pre-filled with `type=WHATSAPP`, `note = rendered message`, outcome empty and focused.
3. **When** I click Call, **Then** `tel:+39347…` opens (the OS dialer or softphone), and the composer is pre-filled with `type=CALL` and the note "Called customer" with the outcome select focused.
4. **When** I click SMS or Email, **Then** `sms:` / `mailto:` links open with the rendered body (mailto also sets a subject), and the composer is pre-filled likewise.
5. The activity is only saved when the rep submits the composer (a deep link can't confirm delivery).
6. **Given** the current local time for the customer is outside their best time, **Then** a hint appears: "Customer prefers evenings (it's 10:15 in Milan)". The customer's timezone is derived from the country.

### US-4 (P1): Multilingual templates with variables
1. The templates exist in **de, fr, it, es, nl, pt, en**, with keys: `first_contact`, `follow_up`, `test_drive_invite`, `offer_share`, `callback_confirm`.
2. Variables: `{firstName}`, `{lastName}`, `{model}` (display name), `{repName}`, `{repFirstName}`, `{dealership}` ("EuroDrive Motors"), `{offerTitle}`, `{offerValue}` (formatted €), `{bestTime}`.
3. **Given** an unsupported customer language, **Then** it falls back to English and the picker says "Template in English (no {language} template)".
4. **Given** `offer_share` and no applicable offer, **Then** that template is disabled.
5. The rep can switch the template language in the picker (for example a Swiss customer who writes in French).

### US-5 (P2): Edit preferences
1. **Given** the customer card, **When** the rep clicks "Edit preferences", **Then** they can change the preferred/secondary channel, best time and language. Saving writes an audit row and a NOTE system activity "Preferences updated: WhatsApp → Call".

## 3. Functional Requirements
- **FR-001**: `ChannelAdapter` interface: `{ channel: Channel; isAvailable(customer): boolean; buildLink(customer, message, opts?): string; send?(customer, message): Promise<SendResult> }`. v1 implements `DeepLinkAdapter` for all four channels, with `send` undefined.
- **FR-002**: The link formats:
  - WHATSAPP: `https://wa.me/<E164 digits without +>?text=<urlencoded>`
  - CALL: `tel:<E164>`
  - SMS: `sms:<E164>?&body=<urlencoded>` (the `?&` form works on both iOS and Android)
  - EMAIL: `mailto:<email>?subject=<enc>&body=<enc>`
- **FR-003**: Phone numbers MUST be stored in E.164 (F01/F10 normalization) and displayed with `libphonenumber-js` international format.
- **FR-004**: Availability: WHATSAPP/CALL/SMS need a phone, EMAIL needs an email. Unavailable channels are disabled with a reason.
- **FR-005**: Template rendering is a pure function `renderTemplate(key, lang, vars) → {subject?, body}`. Unknown variables render as empty strings, and a dev-mode warning is logged. The output is plain text (no HTML).
- **FR-006**: The composer prefill contract (from F06): `composer.prefill({ type, note, channel, aiAssisted?: false })`, exposed through a React context on the detail page.
- **FR-007**: The channel click itself MUST NOT write to the DB (no phantom activities). Optionally emit a client analytics log only.
- **FR-008**: `GET /api/customers/:id` returns the profile plus `history { purchases[], leads[] }`, where leads outside the caller's scope are redacted to `{reference, stage, createdAt}`.
- **FR-009**: `PATCH /api/customers/:id` (preferences only) requires `lead:write` on at least one of the customer's leads in the caller's scope.
- **FR-010**: Customer timezone map by country: DE/AT/CH/FR/BE/NL/LU/IT/ES → Europe/<capital>; PT → Europe/Lisbon. Best-time windows: MORNING 08–12, AFTERNOON 12–17, EVENING 17–20.
- **FR-011**: `repName` comes from the current user, and `model` from the vehicle catalog display name.

## 4. Key Entities & Data
`customers` (all preference fields, phone, email, country, city, age_band, language, marketing_consent), `purchases`, `leads` (history), `offers` (via F15 for `offer_share`), vehicle catalog (shared).

## 5. Edge Cases & Error Handling
- A phone that fails E.164 parsing in legacy seed data: phone-based channels are disabled with "Invalid phone number".
- A very long template plus a long URL: wa.me handles about 2,000 chars, so truncate the message to 1,000 chars with a warning.
- A pop-up blocker on `window.open`: use `<a href target="_blank" rel="noopener">` for WhatsApp and a plain anchor for `tel:`/`sms:`/`mailto:`.
- A desktop without a tel handler: nothing happens. Show the copy-number button next to Call.
- Accented names in templates (`Émile`, `João`): UTF-8 URL encoding via `encodeURIComponent`.
- A returning customer matched by email while the phone differs: the history still shows. The card shows the customer's stored phone, and the newly submitted phone is recorded in the lead's `LEAD_CREATED` activity metadata by F10 dedupe.

## 6. Success Criteria
- **SC-001**: From opening a lead to the customer's app open with a pre-written message in their language: ≤ 2 clicks.
- **SC-002**: The template set covers 7 languages × 5 keys (35 templates). A test asserts every key exists in every language and renders without leftover `{…}` placeholders.
- **SC-003**: The link builders pass unit tests for all 4 channels, including special characters.
- **SC-004**: 100% of seeded returning customers show a History card with at least one entry.

## 7. UX Notes
- Left column (280 px): Customer card → Interest card (F05) → History card.
- Right column top: the channel bar. The primary button is large ("★ WhatsApp"), with a row of 3 icon buttons plus labels for the other channels underneath. The best-time hint sits under it in muted text.
- Template picker: a popover with a template list (left) and a preview (right), a language select, and "Open WhatsApp" plus "Copy text" buttons.
- Icons: lucide `MessageCircle` (WhatsApp), `Phone`, `MessageSquare` (SMS), `Mail`. They always have text labels.

## 8. Decisions
| # | Decision | Alternatives | Rationale |
|---|---|---|---|
| 1 | Deep links plus a manual confirm via the composer | WhatsApp Business API / Twilio | No vendor onboarding, and it works today. The adapter interface keeps the path open |
| 2 | Templates in a shared TS module (typed keys × languages) | DB-managed templates; i18n library | Fast, type-checked, versioned in git. DB-managed templates are future work |
| 3 | Clicking doesn't log. Submitting does | Auto-log on click | Avoids fake activity data. The rep confirms the outcome |
| 4 | Redact out-of-scope past leads rather than hiding them | Hide entirely | The rep knows history exists without seeing data they aren't authorized to see |
| 5 | Country → timezone mapping | Store a timezone per customer | Good enough for EU single-timezone countries (PT is the exception and is mapped) |

## 9. Technical Plan Input
**Endpoints**
```json
// GET /api/customers/:id
{ "customer": { "id":"c_1","firstName":"Giulia","lastName":"Conti","phone":"+393471234567","email":"giulia.conti@example.it",
    "country":"IT","city":"Milano","ageBand":"26-35","language":"it","preferredChannel":"WHATSAPP","secondaryChannel":"SMS",
    "bestTime":"EVENING","marketingConsent":true,"isReturning":true },
  "history": { "purchases":[{"vehicleModel":"metro-hatch","amount":2150000,"purchasedAt":1616000000000}],
               "leads":[{"id":"l_9","reference":"EDM-2024-00123","stage":"WON","createdAt":1700000000000,"ownerName":"Luca Romano","inScope":true}] } }

// PATCH /api/customers/:id
{ "preferredChannel":"CALL","secondaryChannel":"WHATSAPP","bestTime":"MORNING","language":"it" }

// GET /api/leads/:id/contact-link?channel=WHATSAPP&template=first_contact&lang=it   (optional server-side builder; the client may build links itself via shared code)
{ "href":"https://wa.me/393471234567?text=Ciao%20Giulia%2C%20sono%20Sofia%20di%20EuroDrive%20Motors...","message":"Ciao Giulia, ..." }
```
**Modules:** `server/channels/{ChannelAdapter.ts, DeepLinkAdapter.ts, index.ts}` (the link builders are pure and also exported for the client via `packages/shared/src/channels.ts`), `packages/shared/src/templates.ts` (`TEMPLATES[key][lang]`, `renderTemplate`), `components/leads/customer/{CustomerCard, HistoryCard, EditPreferencesDialog}.tsx`, `components/leads/channels/{ChannelBar, TemplatePicker, BestTimeHint}.tsx`.
**Sample template (it, first_contact):** "Ciao {firstName}, sono {repFirstName} di {dealership}. Grazie per l'interesse per la {model}! Quando preferisci che ti contatti per i dettagli?"
**Tests:** link builder tests per channel with accented characters, template completeness (7×5), renderTemplate variables and fallback, redaction of out-of-scope history, a Playwright test (click WhatsApp → composer prefilled; intercept `window.open`).

## 10. Out of Scope
- Real message sending or delivery receipts, and inbound message sync.
- Template management UI.
- Full GDPR consent capture flows.

## 11. Open Questions
- Should the customer card be editable beyond preferences (name, phone)? Proposed: no in v1, to protect dedupe integrity.
- Should the showroom capture a secondary channel? Proposed: optional field (coordinate with F13).

## 12. Spec Kit Prompts
**`/speckit.specify`**
> On each lead, salespeople see a customer card: name, phone, email, city and country, age group, language, preferred and secondary contact channel, and best time to contact. Returning customers are clearly marked, with their past purchases and past enquiries. The customer's preferred channel (WhatsApp, call, SMS or email) is the most prominent action. One click opens that channel with a ready-made message in the customer's own language (German, French, Italian, Spanish, Dutch, Portuguese or English), personalised with their name, the car they're interested in, the salesperson's name and any applicable offer. At the same time, the activity form is pre-filled so the salesperson only has to confirm the outcome to log the touch. Nothing is logged until they confirm. Channels without the needed contact detail are disabled with a reason. Salespeople see a hint when it's outside the customer's preferred contact time, and can update the customer's preferences.

**`/speckit.plan`**
> A `ChannelAdapter` interface with `DeepLinkAdapter` (wa.me, tel:, sms:?&body=, mailto:) as pure builders in `packages/shared/src/channels.ts`, re-exported under `apps/web/server/channels`. Typed multilingual templates in `packages/shared/src/templates.ts` with `renderTemplate`. Phones in E.164 via libphonenumber-js. `GET/PATCH /api/customers/:id` route handlers authorized via F03, redacting out-of-scope history. React components in the F05 detail-page slots: CustomerCard, HistoryCard, ChannelBar, TemplatePicker (shadcn Popover), BestTimeHint using Intl with a country-to-timezone map. They call the F06 composer `prefill()` context. Vitest for builders and templates, Playwright for the click-to-prefill flow.
