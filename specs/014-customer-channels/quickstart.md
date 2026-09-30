# Quickstart: validating F14

Prerequisites: F01 seed loaded (`npm run db:reset`), F05 detail page and F06 composer merged (or stubbed), `npm install`.

1. Unit: `npm test -- channels templates customer-timezone customer-profile` → builders (incl. accents), 7×5 template completeness, fallback, timezone/hint, redaction all green.
2. RBAC: `npm test -- customers.rbac` → REP/MANAGER/VP, in- and out-of-scope, for GET/PATCH/contact-link.
3. Manual: `npm run dev` (respect `PORT`), sign in as a rep, open Giulia Conti's lead → card, ★ WhatsApp primary, click it, pick template, "Open WhatsApp" → new tab with `wa.me/393471234567?text=…`, composer prefilled `WHATSAPP` with the note; nothing saved until submit.
4. Edit preferences → change to Call; the timeline shows "Preferences updated: WhatsApp → Call".
5. e2e: `npm run test:e2e -- customer-channels` (intercepts anchor navigation).
