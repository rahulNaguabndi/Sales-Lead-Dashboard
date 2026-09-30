# Research: F02 — Authentication & Sessions

All decisions come from `docs/features/F02-authentication.md` §8; nothing was left as NEEDS CLARIFICATION.

| Topic | Decision | Rationale | Alternatives |
|---|---|---|---|
| Session mechanism | HS256 JWT via `jose` in httpOnly cookie | Explainable, edge-compatible, XSS-resistant | Auth.js, Clerk, Lucia, localStorage |
| Revocation | Redis `jti` denylist + `token_version` | Stateless happy path, instant revoke | Server session table |
| Password hash | `bcryptjs` cost 10 + dummy compare | Pure JS, portable, timing equalization | argon2 (native build risk) |
| Middleware scope | Signature + expiry + Origin only | Edge can't use SQLite/ioredis | Full check in middleware |
| Rate limiting | 5 failures / 15 min per ip+email, Redis INCR/EXPIRE, Map fallback | Constitution VII | Per-IP only (hurts shared showroom IPs) |
| CSRF | SameSite=Lax + Origin header check | Defense in depth | CSRF tokens (overkill with JSON-only APIs) |
| Clock skew | `clockTolerance: 30s` | Spec edge case | none |
| Persona login | Uses real `/api/auth/login` | No backdoor (D6) | Impersonate endpoint |
| Next.js gateway filename | `middleware.ts` (F01 uses Next 14) | Convention for installed version | `proxy.ts` for Next ≥ 16 |

## Cross-feature discrepancy (resolved)
F01 `UnauthorizedError` has code `UNAUTHORIZED`; the F02 spec requires `UNAUTHENTICATED`. Resolution: F02 owns `server/auth/errors.ts` with `UnauthenticatedError extends UnauthorizedError` (status 401, code `UNAUTHENTICATED`), thrown by `requireUser()`. Middleware and `/api/auth/me` emit the same code. No F01 change required.
