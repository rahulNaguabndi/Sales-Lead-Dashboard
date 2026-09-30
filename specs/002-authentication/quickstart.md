# Quickstart: validating F02

Prerequisites: F01 scaffold present, `JWT_SECRET` ≥ 32 chars, `npm run db:reset`. Redis optional.

1. `npm run dev` (respect `PORT`). Open `/inbox` signed out → redirected to `/login?next=%2Finbox`.
2. Click "Sofia Rossi" persona (dev only) → lands on `/inbox`. Logout via user menu → `/login`.
3. `curl -i -X POST $APP/api/auth/login -H 'Origin: $APP' -H 'content-type: application/json' -d '{"email":"sofia.rossi@eurodrive.test","password":"demo1234"}'` → 200 and `Set-Cookie` with `HttpOnly; SameSite=Lax`.
4. `curl -i $APP/api/leads` without cookie → `401 UNAUTHENTICATED`.
5. Replay the cookie after logout (Redis up) → 401.
6. Six wrong passwords for one email → 429 with `Retry-After`.
7. Automated: `npm test -- auth` and `npm run test:e2e -- auth`.

See [contracts/auth-api.md](contracts/auth-api.md) and [data-model.md](data-model.md).
