# Quickstart: validating F15

Prereqs: `npm install`, `npm run db:reset` (seeded, `SEED=42`). Use `PORT` for the dev server.

1. `npm test -- offer` runs matcher, schema, service and RBAC tests.
2. `PORT=<free> npm run dev`, sign in as a rep, open a returning customer's lead with a trade-in: Loyalty and Winter Trade-in are listed with reasons; Summer EV Cashback is absent.
3. The top bar shows the active-offer count; the popover lists offers and links to `/offers`.
4. Sign in as the VP, open `/offers`, create "Autumn Finance 0,9 %" (requiresFinance, DE/AT); a rep's matching lead shows it within 2 s.
5. As a rep, `POST /api/offers` returns 403.
6. `npm run test:e2e -- offers` runs the Playwright journey.
