# Contracts: Follow-ups API

All endpoints: session required; JSON only; Zod-validated; errors use F01 `AppError` shape.

## POST /api/leads/:id/follow-ups
Requires `lead:write` on the lead.
```json
{ "dueAt": 1790050000000, "note": "Send finance quote" }
```
- 201 `{ "followUp": { "id", "leadId", "assignedTo", "dueAt", "status": "PENDING" } }`
- 400 `VALIDATION` "Pick a future time" (past beyond 60 s tolerance) or > 90 days
- 403 out of scope · 404 unknown lead · 409 lead closed

Assignee = lead owner, else the caller. Supersedes any existing PENDING follow-up for the same (lead, assignee) (FR-002).

## PATCH /api/follow-ups/:id
Requires `lead:write` on the parent lead.
```json
{ "action": "complete" }
{ "action": "snooze", "dueAt": 1790060000000 }
{ "action": "cancel", "note": "Customer on holiday" }
```
- 200 `{ "followUp": { ... } }` · 400 · 403 · 404 · 409 if not PENDING

## GET /api/follow-ups?view=today|overdue|upcoming[&owner=<id>]
Current user's follow-ups; `owner` only for MANAGER/VP within scope (403 otherwise).
```json
{ "items": [ { "id", "dueAt", "overdue": true, "lead": { "id", "name", "priority", "preferredChannel" } } ],
  "counts": { "dueToday": 6, "overdue": 2 } }
```
Ordering: overdue first (oldest due first), then today ascending. "Today" is the caller's local day, passed as `tzOffset`-free `from`/`to` ms bounds computed client-side (server defaults to UTC day).

## Composer integration (F06 schema, already shared)
`nextFollowUp?: { dueAt: ISO string, note?: string }`, `completeFollowUpId?: string` — executed in the activity transaction via `followupService.createInTx/completeInTx`.

## Events
`followup.due { followUpId, leadId, assignedTo, dueAt }` · `lead.updated` (auto-COLD) · `activity.created`.
