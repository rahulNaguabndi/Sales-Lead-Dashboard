# Data Model: F12 Live Updates

No database changes. In-memory structures only.

| Structure | Where | Fields / rules |
|---|---|---|
| `Scope` | server, per connection | `userIds: Set<string>`, `teamIds: Set<string>`, `isVP: boolean`, `refreshedAt` |
| `Connection` | hub registry | `id`, `userId`, `openedAt`, `scope`, `write(frame)`, `close()`, timers (heartbeat 25 s, scope refresh 60 s) |
| `BufferedEvent` | hub ring buffer (max 500) | `{ id: ulid, event: LeadDeskEvent }`, oldest evicted first |
| `LiveState` | client store | `status: 'live' \| 'reconnecting' \| 'offline'`, `offlineSince`, `highlighted: Map<leadId, expiresAt>` (5 s TTL), `lastUpdatedBy: Map<leadId, {name, at}>` |

**Filter truth table** (`filterFor`): VP → all. `offer.changed` → all. `followup.due` → only when the user is the
assignee (falls back to `ownerId`). Otherwise deliver if `ownerId ∈ userIds`, or (`ownerId == null` and
`teamId ∈ teamIds`), or (`lead.assigned` and `fromOwnerId ∈ userIds`).
