# Implementation Plan: F02 — Authentication & Sessions

**Branch**: `002-authentication` | **Date**: 2026-09-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-authentication/spec.md`

## Summary

Email + password sign-in that issues an HS256 JWT (8 h) in the httpOnly cookie `ld_session`. An edge-safe `middleware.ts` verifies signature/expiry for everything outside a public list and enforces an Origin check on mutations. The Node-side `getCurrentUser()` (React `cache`-memoized) additionally checks the Redis `jti` denylist (skipped when degraded), loads the user from SQLite and compares `is_active` / `token_version`. Logout revokes the `jti`; `revokeAllSessions()` bumps `token_version`. A Redis (in-memory fallback) limiter throttles failed logins. The login page offers demo persona cards outside production. Auth events go through F01's `writeAudit`.

## Technical Context

**Language/Version**: TypeScript 5.x strict, Node ≥ 20 (per F01).

**Primary Dependencies** (all already installed by F01; **no new dependencies**):
- `jose`: JWT sign/verify, works in the edge runtime used by middleware.
- `bcryptjs`: pure-JS password hashing, cost 10 (avoids native build issues on Windows).
- `zod` (via `packages/shared`): `LoginSchema`.
- `ulid`: `jti` generation.
- `ioredis` via F01 `getRedis()`: denylist and rate-limit counters.
- F01 `withTx`, `writeAudit`, `AppError` family, `toErrorResponse`, shadcn/ui components, Sonner toast.

**Storage**: Reads `users` (F01 schema, no changes). Redis keys `auth:revoked:<jti>` (TTL = remaining life), `rl:login:<ip>:<emailHash>` (TTL 900 s). `audit_log` writes.

**Testing**: Vitest (unit + route-handler integration against a fresh seeded temp SQLite), Playwright e2e using `PORT`.

**Target Platform**: Next.js 14 App Router, so the gateway file is `middleware.ts` (renamed `proxy.ts` only if the installed version uses that convention).

**Project Type**: web application inside the npm-workspaces monorepo (`apps/web`).

**Performance Goals**: login < 400 ms p95 including bcrypt (cost 10 ≈ 60–80 ms). `getCurrentUser` = 1 Redis GET + 1 indexed PK lookup, memoized per request.

**Constraints**: middleware has no DB/Redis access; works with Redis down and no AI key; never logs the token, password or raw email (email hashed for `auth.login_failed`); no hardcoded ports.

**Scale/Scope**: 16 seeded users; 3 endpoints, 1 page, 1 component slot.

## Constitution Check

| Principle | Status | Notes |
|---|---|---|
| I. Spec is source of truth | ✅ | Plan follows F02 §9; discrepancies logged below |
| II. Mandatory reqs first | ✅ | F02 protects R1–R3; blocks F04–F06 |
| III. Layered architecture | ✅ | Route handler → Zod → auth service modules (`server/auth/*`) → F01 repos/db. No Next.js imports in `password.ts`, `jwt.ts`, `rate-limit.ts`; only `session.ts` touches `next/headers` |
| IV. Security by default | ✅ | bcrypt, httpOnly JWT cookie, Zod at boundary, secrets from env, PII not logged |
| V. Test-first | ✅ | Unit tests for jwt / next-sanitizer / rate-limit precede implementation; RBAC-style 401 enumeration test; e2e for persona + redirect-back |
| VI. Data integrity | ✅ | Audit rows written through `writeAudit` inside `withTx` |
| VII. Graceful degradation | ✅ | Redis down: revocation check skipped + warn, rate-limit in-memory, logout still clears cookie |
| VIII. Simplicity | ✅ | No new dependencies, no speculative abstractions |
| IX. Performance | ✅ | See goals |
| X. UX consistency | ✅ | shadcn/ui, `role="alert"` errors, keyboard accessible, loading states |

**Gate result: PASS.** No Complexity Tracking entries.

## Project Structure

### Documentation (this feature)

```text
specs/002-authentication/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/auth-api.md
├── assumptions.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (owned paths only)

```text
apps/web/
├── middleware.ts                         # gateway: verify, redirect vs 401, Origin check
├── server/auth/
│   ├── password.ts                       # hashPassword, verifyPassword, DUMMY_HASH
│   ├── jwt.ts                            # signSession, verifySession (edge-safe: jose only)
│   ├── session.ts                        # getCurrentUser, requireUser, cookie helpers, revokeJti, isRevoked, revokeAllSessions
│   ├── rate-limit.ts                     # hitLoginLimiter / resetLoginLimiter (Redis + Map fallback)
│   ├── next-path.ts                      # sanitizeNext(), roleHome()
│   └── constants.ts                      # SESSION_COOKIE, SESSION_TTL_SECONDS, PUBLIC paths (edge-safe)
├── app/(auth)/login/
│   ├── page.tsx                          # server component; redirects if already signed in
│   ├── login-form.tsx                    # client
│   └── demo-personas.tsx                 # client, hidden when NODE_ENV=production
├── app/api/auth/{login,logout,me}/route.ts
├── components/layout/user-menu.tsx       # fills F01 slot
├── lib/api-client.ts                     # created here (append-only for others): 401 → /login?next=
└── tests/
    ├── unit/auth/{jwt,next-path,rate-limit,password}.test.ts
    ├── integration/auth/{login,logout,me,protected-routes}.test.ts
    └── e2e/auth.spec.ts
```

**Structure Decision**: Everything lives in `apps/web`; `LoginSchema` is added to `packages/shared` as an append-only export only if F01's shared package lacks it (otherwise declared locally in the login route to stay within owned paths).

## Key Design Decisions

1. **Two-tier verification (D5)**: middleware = signature + expiry only; `getCurrentUser` = revocation + DB + `tv`. Role is always read from the DB.
2. **Constants module edge-safe**: `constants.ts`, `jwt.ts`, `next-path.ts` import nothing Node-only so middleware can use them.
3. **Error code**: API 401s carry `UNAUTHENTICATED` (spec US-2.2). F01's `UnauthorizedError` uses code `UNAUTHORIZED`; F02 adds `server/auth/errors.ts` with `UnauthenticatedError extends UnauthorizedError` (code `UNAUTHENTICATED`), thrown by `requireUser()`; middleware builds the same body directly. No F01 change needed.
4. **Rate limit**: key `rl:login:<ip>:<sha256(email)[:16]>`, `INCR`+`EXPIRE 900` on failure only; checked before password work; reset on success. Map fallback with expiry timestamps.
5. **Origin check**: compares `Origin` host to request `Host` header (or `x-forwarded-host`); missing Origin on a mutation → 403. Skipped for `/api/intake/**`.
6. **Logout**: verifies the token if present, `SET auth:revoked:<jti> 1 EX <exp-now>` (catch errors → warn), clears cookie, audits, returns 204 always.
7. **Login flow**: Zod parse → limiter check → lookup by normalized email → `verifyPassword` (dummy hash if no user) → on failure: increment counter, audit `auth.login_failed` (hashed email), 401 → inactive check (403) → sign token, audit `auth.login`, reset counter, set cookie, return `{ user }`.
8. **Audit for unknown users**: `entityId` = email hash, `entity` = `users`, `actorId` null.

## Dependencies Recorded

None new. (`jose`, `bcryptjs`, `ulid`, `zod`, `ioredis` all provided by F01 — each already justified in F01's plan.)

## Cross-feature notes

- F01 slot: `components/layout/user-menu.tsx` must exist as a slot; F02 replaces its body.
- F01 seeded users must use password `demo1234` and the four persona emails.
- F20 may later cache the `getCurrentUser` DB lookup.
