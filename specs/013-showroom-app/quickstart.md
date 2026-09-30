# Quickstart: validating F13

Prerequisites: `npm install` at the repo root (F01 scaffold present).

1. **Unit/component tests**: `npm test --workspace apps/showroom` (or root `npm test`). Expect all validation, error-banner, payload, idempotency and toolbar tests green.
2. **Mock mode**: copy `apps/showroom/.env.example` to `apps/showroom/.env`, set `VITE_MOCK_INTAKE=true`, run `npm run dev:showroom` (port from `SHOWROOM_PORT`, default 3001). Open a model, "I'm interested", use "Prefill random buyer", submit: the thank-you page shows an `EDM-2026-…` reference after ~600 ms.
3. **Errors**: stop the web app with mock off, submit: the retry banner shows and input is kept.
4. **Live** (after F10/F12 merge): with the web app running and `INTAKE_API_KEYS` matching, submit from the showroom; the lead appears in the persona inbox. Playwright: `npm run test:e2e` (uses `PORT`/`SHOWROOM_PORT`).
5. **Bundle**: `npm run build --workspace apps/showroom`; check gzip size < 250 KB and that faker is a separate chunk.

See [contracts/intake-client.md](contracts/intake-client.md) and [data-model.md](data-model.md).
