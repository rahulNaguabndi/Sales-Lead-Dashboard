# Contract: `/api/intake/leads`

Request headers: `X-API-Key` (required), `Content-Type: application/json`, optional `Idempotency-Key`. Body: `IntakeLeadSchema` from `@leaddesk/shared` (F01 §9.2), at most 10 KB.

| Status | Body | When |
|---|---|---|
| 201 | `{ reference, status: 'created', assignedTo: { firstName } \| null, expectedContact: { channel, bestTime } }` | Lead created |
| 200 | same, `status: 'duplicate'` | Idempotent replay (24 h) or implicit duplicate (10 min) |
| 202 | `{ status: 'accepted' }` | Honeypot `website` non-empty; nothing stored; warning logged |
| 400 | `{ error: { code: 'VALIDATION_ERROR', message, fields: { path: message } } }` | Schema, phone or budget errors |
| 401 | `{ error: { code: 'UNAUTHORIZED_CLIENT' } }` | Missing or unknown key |
| 413 | `PAYLOAD_TOO_LARGE` | Over 10 KB |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Not JSON |
| 429 | `RATE_LIMITED` + `Retry-After` | More than 60/min per `name:ip` |
| 500 | `INTERNAL` | Unexpected |

Check order: content type (415) → size (413) → key (401) → rate limit (429) → JSON parse and Zod (400) → honeypot (202) → ingest.

`OPTIONS`: 204 with `Access-Control-Allow-Origin: $SHOWROOM_ORIGIN`, `Allow-Methods: POST, OPTIONS`, `Allow-Headers: Content-Type, X-API-Key, Idempotency-Key`, only when `Origin` equals `SHOWROOM_ORIGIN`; otherwise no CORS headers. Actual responses add `Access-Control-Allow-Origin` under the same rule.

The response never includes ids, scores or other customers' data (FR-020).

## Events published after commit

- `lead.created { lead: LeadSummary, teamId, ownerId, by: null, at }`
- `lead.assigned { leadId, teamId, fromOwnerId: null, toOwnerId, ownerId, by: null, method: 'AUTO', strategy, reason, at }` (only when an owner is set)
