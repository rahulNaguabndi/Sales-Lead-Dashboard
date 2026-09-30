# Contract: Platform Interfaces

**Phase 1 output** | Modules: `apps/web/server/{db,redis,events,cache,http}/`

These interfaces define the contracts that every feature in the app depends on. F01 ships
the implementations; features only depend on the interface types.

---

## Database Client & Transaction Helper (`server/db/client.ts`)

```ts
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const db: BetterSQLite3Database<typeof schema>;
// Singleton stored on globalThis to survive Next.js hot reload.
// Connection settings applied on open:
//   journal_mode=WAL, foreign_keys=ON, busy_timeout=5000, synchronous=NORMAL

export function withTx<T>(fn: (tx: Tx) => T): T;
// Runs fn inside a synchronous better-sqlite3 transaction.
// This is the ONLY way services perform multi-row writes.
// Throws and rolls back if fn throws; otherwise commits.
```

**Fallback driver**: If `better-sqlite3` native build fails (Node 24, Windows ARM), replace
the driver in `client.ts` with `@libsql/client`. The Drizzle instance type remains the same;
no other file changes.

---

## Audit Writer (`server/db/audit.ts`)

```ts
export function writeAudit(
  tx: Tx,
  entry: {
    actorId:  string | null;   // null for system/intake actions
    action:   string;          // e.g. 'lead.assign', 'lead.stage_change'
    entity:   string;          // table name, e.g. 'leads'
    entityId: string;          // ULID of the affected row
    before?:  unknown;         // state before mutation (JSON-serialisable)
    after?:   unknown;         // state after mutation
    ip?:      string | null;
    meta?:    Record<string, unknown>;
    // Common meta keys: actorType ('USER'|'SYSTEM'|'INTAKE'), userAgent, method,
    //   strategy ('AUTO'|'MANUAL'|'CLAIM'), requestId
  }
): void;
```

**Guarantees**:
- Inserts into `audit_log` inside the **caller's transaction**. If the transaction rolls back,
  no audit row persists.
- `audit_log` is append-only at the DB level (triggers prevent UPDATE/DELETE).

---

## Redis Client (`server/redis/client.ts`)

```ts
export function getRedis(): Redis;
// Returns the shared ioredis command client.
// Lazy singleton; stored on globalThis.
// Config: maxRetriesPerRequest=1, enableOfflineQueue=false, connectTimeout=500ms.
// On connection failure: logs once, enters degraded mode, retries every 10s.
// Never throws to callers.

export function getRedisSubscriber(): Redis;
// Returns a dedicated subscriber connection (cannot issue commands).
// Same singleton and failure behaviour as getRedis().

export function redisStatus(): 'connected' | 'degraded';
// 'connected': Redis responded successfully on last check.
// 'degraded': connection failed or not yet established.
```

---

## Cache Interface (`server/cache/cache.ts`)

```ts
export interface Cache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  del(...keys: string[]): Promise<void>;
  delByPrefix(prefix: string): Promise<void>;   // SCAN + UNLINK pattern
  wrap<T>(
    key: string,
    ttlSeconds: number,
    loader: () => Promise<T>
  ): Promise<T>;                                // cache-aside: get or load-and-set
}

export const cache: Cache;
// RedisCache when redisStatus() === 'connected'; NoopCache otherwise.
// All cache keys are prefixed 'cache:' automatically.
// TTL strategy and per-key decisions are owned by F20.
// F01 provides the primitive only.
```

**NoopCache** (degraded mode): `get` always returns `null`; `set`/`del` are no-ops;
`wrap` always calls the loader. Application correctness is maintained; performance
degrades to direct DB reads.

---

## HTTP Error Shapes (`server/http/errors.ts`)

```ts
class AppError extends Error {
  statusCode: number;
  code:       string;
}

class ValidationError extends AppError    { statusCode = 400; code = 'VALIDATION_ERROR'; }
class UnauthorizedError extends AppError  { statusCode = 401; code = 'UNAUTHORIZED'; }
class ForbiddenError extends AppError     { statusCode = 403; code = 'FORBIDDEN'; }
class NotFoundError extends AppError      { statusCode = 404; code = 'NOT_FOUND'; }
class ConflictError extends AppError      { statusCode = 409; code = 'CONFLICT'; }
class RateLimitError extends AppError     { statusCode = 429; code = 'RATE_LIMITED'; }

function toErrorResponse(err: unknown): {
  status:  number;
  body:    ApiError;
};
// ApiError = { error: { code, message, fields? } }
// fields: Record<fieldPath, message> — populated for ValidationError (400)
// Unknown errors map to 500 INTERNAL_ERROR without leaking stack traces.
// All errors are logged with a requestId.
```

**JSON error shape example (400)**:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request body is invalid",
    "fields": {
      "email": "Invalid email address",
      "budgetMin": "Minimum budget exceeds maximum"
    }
  }
}
```

---

## Request Logger (`server/http/logger.ts`)

```ts
function logRequest(entry: {
  route:     string;
  userId:    string | null;
  status:    number;
  ms:        number;
  requestId: string;
}): void;
// Writes structured JSON to stdout. Never logs PII (email, phone, name).
```
