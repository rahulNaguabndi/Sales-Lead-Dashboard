# Quickstart: validating F16

Prerequisites: F01, F03, F07 (and F04, F12 for drill-down/live) merged; `npm install`; `npm run db:reset` (SEED=42).

1. Unit + RBAC: `npm test -- dashboard` (fixture DB metrics, period/timezone boundary, division by zero, scope).
2. Run the app (respect `PORT`): `npm run dev`.
3. Log in as Lukas Becker → `/dashboard`: six KPI tiles, leaderboard, charts; switch to Last 7 days and confirm `?range=7d`.
4. Click Felix's overdue cell → `/inbox?view=team&owner=<id>&overdue=1` with a matching count.
5. Log in as Isabelle → team comparison; set Team South; click the Referral bar.
6. Log in as Sofia → personal tiles only, no leaderboard.
7. Live: with the dashboard open, submit a Showroom lead (or `npm run simulate`) → New leads increments within 7 s.
8. `npm run test:e2e -- dashboard`, and run the palette validator on the light and dark tokens.
