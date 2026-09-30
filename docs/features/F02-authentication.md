# F02 — Authentication & Sessions

| Field | Value |
|---|---|
| **ID** | F02 |
| **Priority** | P0 |
| **Build wave** | 1 |
| **Depends on** | F01 |
| **Blocks** | F04, F05, F06 (and every authenticated screen) |
| **Personas** | REP, MANAGER, VP |
| **Challenge req.** | — (protects R1–R3) |
| **Owns (files/areas)** | `apps/web/server/auth/**`, `apps/web/app/(auth)/**`, `apps/web/app/api/auth/**`, `apps/web/middleware.ts` (named `proxy.ts` if the installed Next.js version uses that convention), `apps/web/components/layout/user-menu.tsx` (fills the F01 slot) |

## 1. Summary
Staff sign in with email and password and get a signed, short-lived session token in an httpOnly cookie. Every protected page and API verifies it. Logout revokes the token immediately (Redis), and an admin-level "log out everywhere" works through a per-user token version. The login page has one-click "Login as" buttons for the seeded demo personas so the demo flows smoothly. F02 also provides `getCurrentUser()`, which every other feature uses.

## 2. User Stories & Acceptance Scenarios

### US-1 (P1): Sign in
*As a salesperson, manager or VP, I want to sign in with my email and password so that I see only the data I'm allowed to see.*

**Independent test:** Sign in as `sofia.rossi@eurodrive.test` / `demo1234` and land on `/inbox`.

1. **Given** valid credentials for a REP, **When** I submit the login form, **Then** a session cookie is set and I'm redirected to `/inbox` (MANAGER/VP → `/dashboard`).
2. **Given** a wrong password *or* an unknown email, **When** I submit, **Then** I see the same message "Email or password is incorrect" and no cookie is set.
3. **Given** I came from `/leads/abc` while signed out, **When** I sign in, **Then** I'm redirected back to `/leads/abc`.
4. **Given** a deactivated user (`is_active = 0`), **When** they submit correct credentials, **Then** they see "Your account is disabled. Contact your manager."

### US-2 (P1): Protected access
*As the business, I want every internal page and API to require a valid session so that lead data never leaks.*

1. **Given** no cookie, **When** I open `/inbox`, **Then** I'm redirected to `/login?next=%2Finbox`.
2. **Given** no cookie, **When** I call `GET /api/leads`, **Then** I get `401 {"error":{"code":"UNAUTHENTICATED",…}}` (no redirect for API calls).
3. **Given** an expired or tampered token, **Then** it's treated as no cookie, and the cookie is cleared.
4. **Given** `/api/intake/leads`, `/login`, `/api/auth/login`, static assets, **Then** no session is required.

### US-3 (P1): Sign out
*As a user on a shared showroom computer, I want to sign out so that nobody can use my session.*

1. **Given** I'm signed in, **When** I click Logout in the user menu, **Then** the cookie is cleared, the token's `jti` is revoked in Redis for its remaining lifetime, and I land on `/login`.
2. **Given** someone replays the old token after logout (with Redis up), **Then** protected APIs return 401.

### US-4 (P2): Demo "Login as"
*As the presenter, I want one-click persona logins so that I can switch between Rep, Manager and VP views in seconds during the demo.*

1. **Given** a non-production environment, **When** I open `/login`, **Then** I see persona cards: Sofia Rossi (Rep · South), Anna Weber (Rep · DACH), Lukas Becker (Manager · DACH), Isabelle Laurent (VP).
2. **When** I click a card, **Then** it signs in through the normal login endpoint with the seeded demo password (no backdoor endpoint).
3. **Given** `NODE_ENV=production`, **Then** the persona cards aren't rendered.

### US-5 (P2): Revoke all sessions for a user
*As the platform, I want to invalidate every session of a user (deactivation, password change) so that access ends immediately.*

1. **Given** a user's `token_version` is incremented, **When** any of their old tokens is used, **Then** the request gets 401.

## 3. Functional Requirements
- **FR-001**: Passwords MUST be verified with bcrypt (`bcryptjs`, cost 10). Plaintext passwords MUST never be logged or returned.
- **FR-002**: Login MUST normalize the email (trim, lowercase) and return the same 401 error code `INVALID_CREDENTIALS` for an unknown email and a wrong password. It MUST run a dummy bcrypt compare for unknown emails to equalize timing.
- **FR-003**: On success the server MUST issue a JWT signed with HS256 (`jose`) using `JWT_SECRET`, with claims `sub` (user id), `role`, `teamId` (nullable), `name`, `tv` (token_version), `jti` (ULID), `iat`, and `exp` (= iat + 8 h).
- **FR-004**: The token MUST be set as cookie `ld_session` with `HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`, plus `Secure` when `NODE_ENV=production`. It MUST never be exposed to JavaScript or returned in a response body.
- **FR-005**: Middleware MUST verify signature and expiry for every request except the public matcher list (`/login`, `/api/auth/login`, `/api/intake/:path*`, `/_next/:path*`, `/favicon.ico`, static files). Invalid → pages redirect to `/login?next=<path>`, APIs return 401 JSON. The middleware does no DB or Redis access (it may run at the edge).
- **FR-006**: `getCurrentUser()` (Node runtime, memoized per request with React `cache`) MUST: verify the JWT, check `auth:revoked:<jti>` in Redis (skipped with a warning log when Redis is degraded), load the user from the DB, and reject when the user is missing, `is_active = 0`, or `tv ≠ users.token_version`. It returns `CurrentUser = { id, name, email, role, teamId, managerId, languages }`.
- **FR-007**: `requireUser()` MUST throw `UnauthorizedError` when `getCurrentUser()` returns null. Route handlers and server components use it. Server components redirect to login instead.
- **FR-008**: Logout (`POST /api/auth/logout`) MUST clear the cookie (Max-Age=0) and set `auth:revoked:<jti>` with TTL = `exp − now` seconds. It's idempotent: 204 even when already logged out.
- **FR-009**: Login MUST be rate-limited to 5 failed attempts per (IP + email) per 15 minutes using Redis (in-memory fallback), returning 429 `RATE_LIMITED` with a `Retry-After` header.
- **FR-010**: The `next` redirect parameter MUST only accept same-origin relative paths (starts with `/`, not `//`, no scheme). Otherwise it falls back to the role home.
- **FR-011**: Role home: REP → `/inbox`, MANAGER and VP → `/dashboard`.
- **FR-012**: Mutating API requests (POST/PATCH/PUT/DELETE, except `/api/intake/**`) MUST have an `Origin` header matching the app origin, or be rejected with 403 `BAD_ORIGIN` (CSRF defense in depth).
- **FR-013**: Successful and failed logins and logouts MUST be written via `writeAudit` (`auth.login`, `auth.login_failed` with the email hashed, `auth.logout`).
- **FR-014**: `server/auth/session.ts` MUST export `revokeAllSessions(userId)`, which increments `token_version` (used by future user management and in tests).
- **FR-015**: The user menu MUST show the name, a role badge, and the team name, plus a Logout action.

## 4. Key Entities & Data
- `users` (email, password_hash, role, team_id, manager_id, is_active, token_version).
- Redis keys: `auth:revoked:<jti>` (value `1`, TTL = remaining token life); `rl:login:<ip>:<emailHash>` (counter, TTL 900 s).
- `audit_log` rows for auth events.

## 5. Edge Cases & Error Handling
- `JWT_SECRET` missing or < 32 chars → the app fails at startup (F01 env validation).
- Clock skew: `jose` verify with `clockTolerance: 30s`.
- A user's role changes while signed in → the claims are stale. `getCurrentUser()` always reads the role from the DB, so authorization uses fresh data. The token's role claim is only for middleware routing hints.
- Redis down during logout → the cookie is still cleared. Token replay is possible until expiry. This is logged as a degraded-mode limitation.
- Several tabs open during logout → other tabs get 401 on their next API call. The client-side fetch wrapper redirects to `/login` on any 401.
- A login POST with a non-JSON body → 400 `VALIDATION_ERROR`.
- Email with different casing or whitespace → normalized, so login succeeds.

## 6. Success Criteria
- **SC-001**: A seeded user can reach their home screen from `/login` in ≤ 2 interactions (a persona click counts as 1).
- **SC-002**: 100% of the protected API routes return 401 without a valid session (automated test enumerates the routes).
- **SC-003**: After logout, replaying the old cookie is rejected on 100% of the attempts while Redis is available.
- **SC-004**: The login endpoint responds in < 400 ms p95, including bcrypt.
- **SC-005**: No response body, log line, or client-side JS can read the session token.

## 7. UX Notes
- `/login`: a centered card (brand "EuroDrive Lead Desk"). Email and password fields, a "Sign in" button with a loading state, and inline error text under the form (`role="alert"`). Enter submits. Autofocus on email.
- Below, a "Demo accounts" section (non-production only) with 4 persona cards: avatar initials, name, role · team, and a one-line description ("Works South leads, prefers WhatsApp"). Clicking one shows a spinner on that card.
- Password field has a show/hide toggle. No "forgot password" link in the demo (it's in Out of Scope).
- A session-expired redirect shows a toast: "Your session expired. Please sign in again."

## 8. Decisions
| # | Decision | Alternatives | Rationale |
|---|---|---|---|
| D1 | Custom JWT with `jose` | Auth.js/NextAuth, Clerk, Lucia | Every line is explainable in the interview, no vendor, and it works in middleware |
| D2 | httpOnly cookie | localStorage + Authorization header | Not readable by XSS. SameSite limits CSRF |
| D3 | 8 h token, no refresh token | Access + refresh pair | Covers a working shift. Refresh rotation is documented future work |
| D4 | Redis `jti` denylist + `token_version` | Server-side session table | Stays stateless on the happy path, with instant revocation when needed |
| D5 | Middleware only verifies the signature; DB checks happen in `getCurrentUser` | Full check in middleware | The edge runtime can't use SQLite. Keeps middleware fast |
| D6 | Demo personas go through the real login endpoint | Magic "impersonate" endpoint | No backdoor to secure or forget |
| D7 | Same error for an unknown email and a bad password, plus timing equalization | Specific errors | Prevents user enumeration |

## 9. Technical Plan Input (for `/speckit.plan`)

**Endpoints**
| Method | Route | Request | Response |
|---|---|---|---|
| POST | `/api/auth/login` | `{ email: string, password: string }` (Zod `LoginSchema`, password 1–200 chars) | `200 { user: { id, name, role, teamId, home: "/inbox" } }` + `Set-Cookie`. Errors: `401 INVALID_CREDENTIALS`, `403 ACCOUNT_DISABLED`, `429 RATE_LIMITED`, `400 VALIDATION_ERROR` |
| POST | `/api/auth/logout` | — | `204` + cookie cleared |
| GET | `/api/auth/me` | — | `200 { user: CurrentUser }` or `401` |

**Modules**
- `server/auth/password.ts`: `hashPassword`, `verifyPassword`, `DUMMY_HASH`.
- `server/auth/jwt.ts`: `signSession(user) → { token, jti, exp }`, `verifySession(token) → Claims | null` (edge-safe; imports only `jose`).
- `server/auth/session.ts`: `getCurrentUser()`, `requireUser()`, `setSessionCookie(res, token)`, `clearSessionCookie(res)`, `revokeJti(jti, exp)`, `isRevoked(jti)`, `revokeAllSessions(userId)`.
- `server/auth/rate-limit.ts`: `hitLoginLimiter(ip, email)` (Redis INCR + EXPIRE, Map fallback).
- `middleware.ts`: matcher config, `verifySession`, redirect vs 401 by the `/api/` prefix, Origin check for mutations.
- `app/(auth)/login/page.tsx` + `login-form.tsx` (client) + `demo-personas.tsx`.
- `lib/api-client.ts` hook: on 401, `router.replace('/login?next=…')` (shared fetch wrapper; created here and append-only for others).

**Events:** none. **Cache:** none (F20 may decide to cache the `getCurrentUser` DB lookup).

**Tests**
- Unit: sign then verify round-trip. Expired token rejected. Tampered signature rejected. `tv` mismatch rejected. Revoked `jti` rejected. `next` sanitizer cases (`/leads/1` ok, `//evil.com` rejected, `https://x` rejected).
- Integration (route handlers against a test DB): login success sets cookie flags. Unknown email and wrong password give an identical response. Disabled user gets 403. The 6th failed attempt gets 429. Logout then replay gets 401.
- E2E (Playwright): persona click lands on the role home. Visiting `/inbox` signed out redirects to login and returns after sign-in.

## 10. Out of Scope
- Password reset, sign-up, user management UI, MFA/SSO, and refresh-token rotation (all documented as future work).
- Authorization rules (F03).

## 11. Open Questions
- Should sessions slide (re-issue when < 1 h remains)? Proposed: no for v1.

## 12. Spec Kit Prompts
**`/speckit.specify`**
> Staff of a car dealership group (sales reps, managers and a VP) must sign in with email and password before they can see anything in the lead desk. Wrong credentials must show one generic message that doesn't reveal whether the email exists, and repeated failures must be throttled. Signed-out visitors to any internal page are sent to the sign-in page and returned to where they were afterwards. Internal data requests without a valid session are refused. A session lasts one working shift (8 hours). Signing out must end the session immediately, even if someone copied it, and disabling a user or bumping their session version must end all their sessions. Reps land on their inbox, and managers and VPs land on their dashboard. For demos (never in production), the sign-in page offers one-click buttons to sign in as the seeded personas. Every sign-in, failed sign-in and sign-out is recorded in the audit log.

**`/speckit.plan`**
> Next.js App Router route handlers `/api/auth/login|logout|me`. JWT HS256 via `jose` (claims sub, role, teamId, name, tv, jti, iat, exp = 8h) stored in the httpOnly cookie `ld_session` (SameSite=Lax, Secure in prod). bcryptjs cost 10 with a dummy-hash timing equalization. `middleware.ts` does edge-safe signature and expiry checks with a public matcher list, redirecting pages and returning 401 JSON for `/api/*`, plus an Origin check on mutations. `getCurrentUser()` in the Node runtime, memoized with React `cache`, checks the Redis denylist `auth:revoked:<jti>` (degrades gracefully), the DB user (is_active, token_version). Redis login rate limit of 5 failed attempts per ip+email per 15 min with an in-memory fallback. Audit via F01 `writeAudit`. Login page with shadcn/ui, and demo persona cards when NODE_ENV≠production. Tests: Vitest unit and integration plus a Playwright e2e per F02 §9. Only touch the paths owned in docs/features/README.md.
