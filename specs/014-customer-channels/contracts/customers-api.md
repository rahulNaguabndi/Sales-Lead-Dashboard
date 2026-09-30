# Contracts: F14 endpoints

All require an authenticated session (F02) and authorization via F03. JSON errors use F01's shape.

## GET /api/customers/:id?leadId=<id>
Authorizes `lead:read` on the given lead, which must belong to the customer (404 otherwise, to avoid leaking existence).

200:
```json
{ "customer": { "id": "c_1", "firstName": "Giulia", "lastName": "Conti", "phone": "+393471234567", "email": "giulia.conti@example.it",
    "country": "IT", "city": "Milano", "ageBand": "26-35", "language": "it", "preferredChannel": "WHATSAPP", "secondaryChannel": "SMS",
    "bestTime": "EVENING", "marketingConsent": true, "isReturning": true },
  "history": { "purchases": [{ "vehicleModel": "metro-hatch", "amount": 2150000, "purchasedAt": 1616000000000 }],
               "leads": [{ "id": "l_9", "reference": "EDM-2024-00123", "stage": "WON", "createdAt": 1700000000000, "ownerName": "Luca Romano", "inScope": true },
                         { "reference": "EDM-2023-00044", "stage": "LOST", "createdAt": 1690000000000, "inScope": false }] } }
```
Errors: 401, 403 (lead out of scope), 404.

## PATCH /api/customers/:id
Body (at least one preference field plus `leadId`):
```json
{ "leadId": "l_1", "preferredChannel": "CALL", "secondaryChannel": "WHATSAPP", "bestTime": "MORNING", "language": "it" }
```
Requires `lead:write` on `leadId` (in caller's scope, belonging to the customer). 200 returns the updated `customer`. Errors: 400 (Zod), 401, 403, 404, 409 never (no versioning on customers).
Side effects (single transaction): customer update, audit entry, SYSTEM NOTE activity "Preferences updated: WhatsApp → Call".

## GET /api/leads/:id/contact-link?channel=WHATSAPP&template=first_contact&lang=it
Requires `lead:read`. 200 `{ "href": "...", "message": "...", "subject"?: "...", "truncated": false, "langUsed": "it" }`. 400 for unavailable channel (with reason), unknown template/lang, or disabled `offer_share`. No DB writes.

## Shared library contracts
- `buildWhatsAppLink(phoneE164, text)`, `buildTelLink(phoneE164)`, `buildSmsLink(phoneE164, body)`, `buildMailtoLink(email, subject, body)`.
- `renderTemplate(key, lang, vars) → { subject?, body }`.
- `ChannelAdapter { channel; isAvailable(customer); buildLink(customer, message, opts?); send?(customer, message) }`.
- Composer (F06): `composer.prefill({ type, note, channel, aiAssisted?: false })`.
