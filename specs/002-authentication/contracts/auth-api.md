# Contract: Auth API & Modules

## Endpoints
| Method | Route | Request | Success | Errors |
|---|---|---|---|---|
| POST | `/api/auth/login` | JSON `{ email: string, password: string(1–200) }` | `200 { user: { id, name, role, teamId, home } }` + `Set-Cookie: ld_session=…; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800[; Secure]` | `400 VALIDATION_ERROR`, `401 INVALID_CREDENTIALS`, `403 ACCOUNT_DISABLED`, `403 BAD_ORIGIN`, `429 RATE_LIMITED` (+`Retry-After`) |
| POST | `/api/auth/logout` | none | `204` + cookie `Max-Age=0` | `403 BAD_ORIGIN` |
| GET | `/api/auth/me` | none | `200 { user: CurrentUser }` | `401 UNAUTHENTICATED` |

Error shape: `{ "error": { "code", "message", "fields?" } }`. The token is never in a body.

## Gateway (`middleware.ts`)
Public: `/login`, `/api/auth/login`, `/api/intake/*`, `/_next/*`, `/favicon.ico`, static files. Otherwise: invalid/absent/expired token → pages `302 /login?next=<path+query>` (clears a bad cookie; adds `&expired=1` when a token existed but failed), `/api/*` → `401 UNAUTHENTICATED`. Mutations (POST/PATCH/PUT/DELETE, not `/api/intake/*`) need matching `Origin` else `403 BAD_ORIGIN`.

## Module interfaces
```ts
// jwt.ts (edge-safe)
signSession(u: {id; role; teamId; name; tokenVersion}): Promise<{ token: string; jti: string; exp: number }>
verifySession(token: string): Promise<Claims | null>   // clockTolerance 30s
// session.ts (Node)
getCurrentUser(): Promise<CurrentUser | null>          // React cache()
requireUser(): Promise<CurrentUser>                    // throws UnauthorizedError
setSessionCookie(res: NextResponse, token: string): void
clearSessionCookie(res: NextResponse): void
revokeJti(jti: string, exp: number): Promise<void>
isRevoked(jti: string): Promise<boolean>               // false + warn when Redis degraded
revokeAllSessions(userId: string): void                // token_version += 1
// password.ts
hashPassword(p: string): Promise<string>; verifyPassword(p: string, hash: string): Promise<boolean>; DUMMY_HASH: string
// rate-limit.ts
hitLoginLimiter(ip: string, email: string): Promise<{ allowed: boolean; retryAfterSeconds: number }>
// next-path.ts
sanitizeNext(next: string | null | undefined, role: Role): string; roleHome(role: Role): string
```
