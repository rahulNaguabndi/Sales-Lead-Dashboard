# Quickstart: validating F12

Prereqs: F01–F04 and F10 merged. Ports come from `PORT` (default 3000). Redis is optional.

1. `npm run db:reset && npm run dev`
2. Sign in as Anna Weber, open `/inbox`, and check that the status dot shows "Live".
3. `npm run simulate -- --count 1` (or POST the intake API). Within 2 s: toast, row highlight, count update.
4. Sign in as a South rep in a second browser context. Confirm nothing appears for the DACH lead.
5. Stop Redis (`docker compose stop redis`), restart dev, and repeat step 3: it still works, with a `Redis: degraded` log.
6. Restart the server: the dot goes amber and then green within 5 s, and the list refreshes.
7. Automated: `npm test -- sse` and `npm run test:e2e -- live-updates`.
