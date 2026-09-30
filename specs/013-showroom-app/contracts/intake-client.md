# Contract: showroom intake client

Consumer contract for F10's public intake endpoint (see `docs/features/F13-showroom-app.md` §9 and F10).

## Request

`POST {VITE_INTAKE_URL}` (default `http://localhost:3000/api/intake/leads`)

Headers: `Content-Type: application/json`, `X-API-Key: {VITE_INTAKE_API_KEY}`, `Idempotency-Key: {uuid}`. Body: `IntakeLead` JSON. Timeout 10 s.

## Function

```ts
type IntakeError =
  | { kind: 'validation'; fields: { path: string; message: string }[] }
  | { kind: 'unauthorized' } | { kind: 'rate_limited'; retryAfterSec?: number }
  | { kind: 'too_large' } | { kind: 'timeout' } | { kind: 'network' } | { kind: 'server'; status: number };

submitEnquiry(p: IntakeLead, key: string):
  Promise<{ ok: true; data: IntakeResponse | { status: 'accepted' } } | { ok: false; error: IntakeError }>
```

## Status mapping

| Status | Result |
|---|---|
| 201 | ok, `IntakeResponse` (created) |
| 200 | ok, `IntakeResponse` (duplicate, shown as normal thank-you) |
| 202 `{status:'accepted'}` | ok, no reference; generic thank-you |
| 400 `{error:{code:'VALIDATION_ERROR',fields}}` | `validation` |
| 401 | `unauthorized` (+ console hint about `VITE_INTAKE_API_KEY`) |
| 413 | `too_large` |
| 429 (+ `Retry-After`) | `rate_limited` |
| abort | `timeout` |
| fetch rejects | `network` |
| 415, other 4xx/5xx, unparseable body | `server` |

## Banner copy

validation → field errors (banner only for unmapped paths) · server/network → "We couldn't send your enquiry. Please try again." + Retry · rate_limited → "Too many enquiries from this device. Please try again in a minute." · unauthorized → "The enquiry service is misconfigured" · too_large → "Your enquiry is too large. Please shorten your message." · timeout → "The request timed out".

## Mock mode

`VITE_MOCK_INTAKE=true`: no network; resolves after 600 ms with `{reference:'EDM-2026-' + 5 digits, status:'created', assignedTo:null, expectedContact:{channel,bestTime}}`.
