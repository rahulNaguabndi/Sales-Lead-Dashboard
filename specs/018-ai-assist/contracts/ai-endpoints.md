# Contracts: F18 AI endpoints

All endpoints: authenticated, JSON-only, Zod-validated body, `authorize(user, "lead:read", lead)`. Errors use the shared JSON error shape. `403 OUT_OF_SCOPE`, `404 NOT_FOUND`, `400 VALIDATION_ERROR`, `401` unauthenticated.

## POST /api/leads/:id/ai/suggest
Body: `{ "regenerate": false }` (optional, default false)

200:
```json
{
  "source": "AI", "model": "claude-opus-5-5", "cached": false, "generatedAt": 1759240000000,
  "fingerprint": "9f2c…",
  "summary": "Giulia, 26–35, Milan · returning customer …",
  "nextBestAction": { "action": "SEND_OFFER", "channel": "WHATSAPP", "timing": "Today after 18:00",
                      "reason": "Two unanswered calls; prefers WhatsApp evenings; asked about financing.",
                      "offerId": "off_01J…" },
  "confidence": "high"
}
```
Fallback: same shape with `"source":"RULES"`, `"fallbackReason"` ∈ NO_API_KEY | TIMEOUT | API_ERROR | REFUSAL | MAX_TOKENS | INVALID_OUTPUT | RATE_LIMITED (plus `retryAfterMinutes` for RATE_LIMITED). WON/LOST leads: rule-based `WAIT` "No action: closed", no AI call.

## POST /api/leads/:id/ai/draft
Body: `{ "channel": "WHATSAPP"|"SMS"|"EMAIL", "regenerate": false }`. Closed leads → `409 LEAD_CLOSED` (draft disabled).

200:
```json
{ "source": "AI", "cached": false, "generatedAt": 1759240000000, "fingerprint": "…",
  "draft": { "channel": "WHATSAPP", "language": "it", "subject": null, "body": "Ciao Giulia! …", "offerId": "off_01J…" } }
```
Fallback as above, with optional `"templateLanguage":"en"` when the customer language has no template.

## POST /api/leads/:id/ai/feedback
Body: `{ "kind": "suggest"|"draft", "fingerprint": "…", "vote": "up"|"down" }` → `204`. Logged only.

## Cross-feature contracts consumed
- F06 `CreateActivitySchema.aiAssisted?: boolean` (already in F01 §9.2).
- F14 `openChannel(channel, text)`, message templates.
- F15 `matchOffers(leadId)`.
- F05 slot registration `ai` in `slots.tsx`; timeline "AI-assisted" chip.
