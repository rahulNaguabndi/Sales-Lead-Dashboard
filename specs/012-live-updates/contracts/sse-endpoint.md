# Contract: `GET /api/events`

- Auth: `ld_session` cookie via `getCurrentUser()`. No user → `401`, empty body, no stream.
- Headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, `X-Accel-Buffering: no`. `runtime='nodejs'`, `dynamic='force-dynamic'`.
- Request header `Last-Event-ID` (optional): replay newer buffered events that pass the filter, else send `event: resync`.

Frame order on connect:
```
retry: 3000

event: hello
data: {"userId":"u_anna","serverTime":1790000000000}
```
Then per event: `id: <ulid>\nevent: <type>\ndata: <json>\n\n`. Heartbeat every 25 s: `: ping\n\n`.
Types: `lead.created`, `lead.assigned`, `lead.updated`, `activity.created`, `followup.due`, `offer.changed`, plus control `hello`, `resync`.
`data` is the F01 `LeadDeskEvent` JSON (see `specs/001-platform-foundation/contracts/events.md`), validated before broadcast. Invalid payloads are dropped and logged.
Closing: client abort → unregister and clear timers. More than 5 streams per user → the oldest is closed. A scope refresh that finds a revoked, expired or missing user → close.
