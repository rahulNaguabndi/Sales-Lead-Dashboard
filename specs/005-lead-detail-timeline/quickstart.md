# Quickstart: validating F05

Prerequisites: F01 scaffold with seed, F02 login, F03 policy merged (or stubbed). Use `PORT` if set.

1. `npm run db:reset && npm run dev`
2. Sign in as Sofia Rossi, open `/inbox`, click a lead → `/leads/{id}` shows header, Customer/Interest/History/Score cards and the timeline (US-1, US-2).
3. Toggle "Oldest first", reload, open another lead → order persists.
4. Filter "Activities" → SYSTEM entries hidden. Scroll to "Load older" on a lead with > 50 entries.
5. Open a DACH lead URL as Sofia, and a random ULID → identical "Lead not found" page (US-3).
6. Resize below 1024 px → tabs Details · Timeline · Actions.
7. Tests: `npm test` (formatter, cursor, formatting, RBAC/pagination integration) and `npm run test:e2e` (`lead-detail.spec.ts`).
