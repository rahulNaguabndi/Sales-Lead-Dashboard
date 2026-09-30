# Quickstart: validating F11

Prerequisites: `npm install`, `npm run db:reset` (seed), optional Redis (`docker compose up redis`); run the app with `PORT=<free port> npm run dev`.

1. **Unit + service**: `npm test -- assignment` → `pickRep` strategies, the 50-way concurrent claim (exactly 1 success), bulk atomicity, RBAC.
2. **Claim flow (US-1)**: log in as Anna Weber → Inbox → Unassigned → Claim → the lead is in My Leads and the timeline says "Claimed by Anna Weber".
3. **Manager assign (US-2/3)**: as Lukas, assign a lead to Lea through the picker. Select 5 rows and bulk-assign.
4. **VP move (US-4)**: as Isabelle, assign a DACH lead to Sofia Rossi → the team becomes South.
5. **Settings (US-5/6)**: `/team/settings` as Lukas: toggle auto-assign OFF, submit a showroom lead → it lands in Unassigned. Turn it ON with Language match and press Rebalance pool.
6. **Degradation**: stop Redis and repeat step 2. It must still work.
7. **E2E**: `PORT=<free port> npm run test:e2e -- claim`.
