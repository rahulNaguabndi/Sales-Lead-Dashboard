# Contract: Stage API

## PATCH /api/leads/:id/stage
Body (`StageChangeSchema`, discriminated union on `to`):
```json
{ "to": "QUALIFIED", "version": 4, "reason": null }
{ "to": "WON", "version": 4, "dealValue": 3650000, "vehicleModel": "aurora-suv", "appliedOfferId": "01J..", "reason": null }
{ "to": "LOST", "version": 4, "lostReason": "BOUGHT_ELSEWHERE", "lostNote": null }
```
Responses:
- `200 { lead: {id,stage,version,dealValue,closedAt,score,priority}, activities: [...] }` (also for same-stage no-op)
- `401` unauthenticated · `403` out of scope, or reopen without manager+ · `404` unknown lead
- `409 { error: { code: "VERSION_CONFLICT", message, current: lead } }`
- `422 { error: { code: "INVALID_TRANSITION" | "OFFER_NOT_APPLICABLE" | "VALIDATION", message } }`

Events after commit: `lead.updated {leadId, changed:{stage, dealValue?}}`, `activity.created`.

## GET /api/pipeline?owner=&source=&priority=
`200 { columns: [{ stage, count, valueCents, leads: [{id,name,model,priority,score,owner,daysInStage,version}], more }] }`
Scoped like the inbox; WON/LOST last 30 days; ≤ 200 leads per open column by score desc.

## Service interface
`stageService.transition(ctx: {user|null, system?: boolean, tx?}, leadId, input): Promise<{lead, activities}>` — reused by F06 and F08.
