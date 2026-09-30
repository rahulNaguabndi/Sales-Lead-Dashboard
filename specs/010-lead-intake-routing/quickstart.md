# Quickstart / Validation

Prerequisites: F01 merged (`npm install`, `npm run db:reset`), F09 and F03 present. Redis is optional.

1. Start the app on a free port: `PORT=3010 npm run dev -w apps/web`.
2. Happy path: `curl -i -X POST http://localhost:3010/api/intake/leads -H "X-API-Key: showroom-dev-key" -H "Content-Type: application/json" -d @anna.json` returns 201 with `EDM-YYYY-NNNNN`.
3. Bad key gives 401; no phone and no email gives 400 with `fields`; a body with `"website":"x"` gives 202 and no row.
4. Repeat step 2 with the same `Idempotency-Key`: 200 `duplicate`.
5. CORS: an `OPTIONS` request with `Origin: http://localhost:3001` returns the allowed headers; `Origin: http://evil.test` returns none.
6. Simulator: `npm run simulate -- --url http://localhost:3010/api/intake/leads --count 5 --rate 60 --seed 1`; add `--burst --count 20` for the concurrency demo.
7. Stop Redis and repeat steps 2 and 6: intake still works and `redis_degraded` is logged.
8. Automated: `npm test -w apps/web -- intake dedupe routing`, then `npm run test:e2e`.
