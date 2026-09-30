# F17 Quickstart

1. `docker compose up -d redis` (optional, the app degrades without it), then `npm install && npm run db:reset`.
2. `PORT=3000 npm run dev` (respect `PORT` if other features run in parallel).
3. Log in as the VP (seed user), open **Dashboard → Demographics**, choose **Last 90 days**.
4. Expect: three charts, insight lines, footnotes ("N leads without age excluded"), hatched "Not enough data" marks for small bands, a Chart/Table toggle on each card.
5. Log in as a manager: the team filter is hidden and data is limited to their team.
6. Log in as a rep: no Demographics tab, and `curl -b <rep cookie> /api/dashboard/demographics` returns 403.
7. Tests: `npm test -- demographics` and `npm run test:e2e -- demographics`.
