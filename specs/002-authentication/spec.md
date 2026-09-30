# Feature Specification: F02 — Authentication & Sessions

**Feature Branch**: `002-authentication`

**Created**: 2026-09-30

**Status**: Draft

**Input**: User description: "F02 Authentication & Sessions. The authoritative source is docs/features/F02-authentication.md."

---

## Clarifications

### Session 2026-09-30

- Q: Should sessions slide (re-issue when < 1 h remains)? → A: No; fixed 8-hour sessions in v1 (F02 §11).
- Q: Is the "account disabled" message shown before the password is verified? → A: No; only after correct credentials, so it never reveals whether an email exists.
- Q: Does a successful sign-in reset the failed-attempt counter? → A: Yes, and while the limit is reached even correct credentials get 429 until the 15-minute window expires.
- Q: Which failed attempts count toward the limit? → A: Unknown-email and wrong-password attempts (INVALID_CREDENTIALS); validation errors and disabled-account responses do not.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Sign in (Priority: P1)

As a salesperson, manager or VP, I want to sign in with my email and password so that I see only the data I'm allowed to see.

**Why this priority**: Nothing else in the lead desk can be shown or protected without a signed-in identity. Every authenticated screen depends on it.

**Independent Test**: Sign in as `sofia.rossi@eurodrive.test` / `demo1234` and land on the inbox.

**Acceptance Scenarios**:

1. **Given** valid credentials for a REP, **When** I submit the login form, **Then** a session is established and I'm redirected to `/inbox` (MANAGER/VP → `/dashboard`).
2. **Given** a wrong password *or* an unknown email, **When** I submit, **Then** I see the same message "Email or password is incorrect" and no session is established.
3. **Given** I came from `/leads/abc` while signed out, **When** I sign in, **Then** I'm redirected back to `/leads/abc`.
4. **Given** a deactivated user, **When** they submit correct credentials, **Then** they see "Your account is disabled. Contact your manager."

---

### User Story 2 — Protected access (Priority: P1)

As the business, I want every internal page and data request to require a valid session so that lead data never leaks.

**Why this priority**: The core security promise of the product. Without it, lead data is exposed.

**Independent Test**: Open an internal page and call an internal data endpoint with no session; both are refused.

**Acceptance Scenarios**:

1. **Given** no session, **When** I open `/inbox`, **Then** I'm redirected to `/login?next=%2Finbox`.
2. **Given** no session, **When** I request `GET /api/leads`, **Then** I get `401` with error code `UNAUTHENTICATED` in the standard error shape (no redirect for data requests).
3. **Given** an expired or tampered session, **Then** it's treated as no session, and the stored session is cleared.
4. **Given** the lead intake endpoints, the login page, the login endpoint, and static assets, **Then** no session is required.

---

### User Story 3 — Sign out (Priority: P1)

As a user on a shared showroom computer, I want to sign out so that nobody can use my session.

**Why this priority**: Shared showroom computers make an effective sign-out a security necessity.

**Independent Test**: Sign in, sign out, then replay the previously issued session; it is rejected.

**Acceptance Scenarios**:

1. **Given** I'm signed in, **When** I click Logout in the user menu, **Then** my session is cleared from the browser, that specific session is revoked for the rest of its lifetime, and I land on `/login`.
2. **Given** someone replays the old session after logout (with the revocation store available), **Then** protected data requests return 401.

---

### User Story 4 — Demo "Login as" (Priority: P2)

As the presenter, I want one-click persona logins so that I can switch between Rep, Manager and VP views in seconds during the demo.

**Why this priority**: Improves the demo flow but is not required for the product to be secure or usable.

**Independent Test**: Open `/login` in a non-production environment and click a persona card; the matching role home opens.

**Acceptance Scenarios**:

1. **Given** a non-production environment, **When** I open `/login`, **Then** I see persona cards: Sofia Rossi (Rep · South), Anna Weber (Rep · DACH), Lukas Becker (Manager · DACH), Isabelle Laurent (VP).
2. **When** I click a card, **Then** it signs in through the normal sign-in process with the seeded demo password (no backdoor).
3. **Given** a production environment, **Then** the persona cards aren't rendered.

---

### User Story 5 — Revoke all sessions for a user (Priority: P2)

As the platform, I want to invalidate every session of a user (deactivation, password change) so that access ends immediately.

**Why this priority**: Needed by future user management; required for deactivation to be meaningful, but no UI in this feature.

**Independent Test**: Bump a user's session version, then use an older session for that user; it is rejected.

**Acceptance Scenarios**:

1. **Given** a user's session version is incremented, **When** any of their older sessions is used, **Then** the request gets 401.

---

### Edge Cases

- The signing secret is missing or too short → the application refuses to start.
- Small clock differences between servers and clients (up to 30 seconds) don't cause valid sessions to be rejected.
- A user's role changes while signed in → authorization uses the current role from the database; the role stored in the session is only a routing hint.
- The revocation store is unavailable during logout → the session is still cleared in the browser; replay is possible until expiry and this is logged as a known degraded-mode limitation.
- Several tabs are open during logout → other tabs get 401 on their next data request and the client redirects to `/login` on any 401.
- A login request with a non-JSON body → 400 `VALIDATION_ERROR`.
- Email with different casing or surrounding whitespace → normalized, so sign-in succeeds.
- A session-expired redirect shows the notice "Your session expired. Please sign in again."

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Passwords MUST be verified against a salted one-way hash. Plaintext passwords MUST never be logged or returned.
- **FR-002**: Sign-in MUST normalize the email (trim, lowercase) and return the same 401 error code `INVALID_CREDENTIALS` for an unknown email and a wrong password. It MUST do equivalent password-checking work for unknown emails to equalize timing.
- **FR-003**: On success the server MUST issue a signed, tamper-evident session token identifying the user (id, role, team, name), the user's session version, a unique token id, and an issue and expiry time (issue + 8 hours).
- **FR-004**: The token MUST be delivered in a cookie that scripts cannot read, is not sent on cross-site sub-requests, applies to the whole site, lasts 8 hours, and is marked secure-only in production. It MUST never be exposed to client-side code or returned in a response body.
- **FR-005**: Every request except the public list (login page, login endpoint, lead intake endpoints, framework static assets, favicon, static files) MUST have its token signature and expiry verified at the request gateway. Invalid → pages redirect to `/login?next=<path>`, data requests return 401 JSON. The gateway check does no database or revocation-store access.
- **FR-006**: `getCurrentUser()` (server side, computed once per request) MUST verify the token, check the token id against the revocation store (skipped with a warning log when the store is degraded), load the user from the database, and reject when the user is missing, deactivated, or the token's session version differs from the user's. It returns `CurrentUser = { id, name, email, role, teamId, managerId, languages }`.
- **FR-007**: `requireUser()` MUST throw `UnauthorizedError` when there is no current user. Data handlers and server-rendered pages use it; pages redirect to sign-in instead of showing an error.
- **FR-008**: Sign-out MUST clear the cookie and mark the token id revoked for its remaining lifetime. It's idempotent: 204 even when already signed out.
- **FR-009**: Sign-in MUST be rate-limited to 5 failed attempts per (client address + email) per 15 minutes, using the shared store with an in-memory fallback, returning 429 `RATE_LIMITED` with a `Retry-After` header.
- **FR-010**: The `next` redirect parameter MUST only accept same-origin relative paths (starts with `/`, not `//`, no scheme). Otherwise it falls back to the role home.
- **FR-011**: Role home: REP → `/inbox`, MANAGER and VP → `/dashboard`.
- **FR-012**: State-changing requests (POST/PATCH/PUT/DELETE, except lead intake) MUST have an `Origin` matching the app's own origin, or be rejected with 403 `BAD_ORIGIN` (defense in depth against cross-site request forgery).
- **FR-013**: Successful and failed sign-ins and sign-outs MUST be written to the audit log (`auth.login`, `auth.login_failed` with the email hashed, `auth.logout`).
- **FR-014**: The server MUST expose `revokeAllSessions(userId)`, which increments the user's session version (used by future user management and in tests).
- **FR-015**: The user menu MUST show the name, a role badge, and the team name, plus a Logout action.

### Key Entities

- **User**: email, password hash, role, team, manager, active flag, session version (owned by F01).
- **Session token**: signed claims with a unique id; held only in the browser's protected cookie.
- **Revocation entry**: marks one token id as revoked; lives only until the token would have expired.
- **Login-attempt counter**: failed attempts per client address + email hash, lives 15 minutes.
- **Audit entry**: records for `auth.login`, `auth.login_failed`, `auth.logout`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A seeded user can reach their home screen from `/login` in ≤ 2 interactions (a persona click counts as 1).
- **SC-002**: 100% of the protected data routes return 401 without a valid session (an automated test enumerates the routes).
- **SC-003**: After sign-out, replaying the old session is rejected on 100% of attempts while the revocation store is available.
- **SC-004**: Sign-in responds in under 400 ms for 95% of attempts.
- **SC-005**: No response body, log line, or client-side script can read the session token.

## Assumptions

- Depends on F01 (schema with users and `token_version`, audit writer, Redis client with degraded mode, error shape, app shell user-menu slot, environment validation).
- Sessions do not slide or refresh in v1; an 8-hour session covers a working shift (open question resolved: no sliding).
- Authorization rules (scope and policy) are F03's; this feature only identifies the user.
- Out of scope: password reset, sign-up, user management UI, MFA/SSO, refresh-token rotation.
- Sign-in page has no "forgot password" link; password field has a show/hide toggle.
- Demo password for seeded users is `demo1234`.
