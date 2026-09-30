# Contract: `GET /api/dashboard/demographics`

**Auth**: session cookie. Roles: MANAGER, VP. REP → 403. No session → 401.

## Query (Zod-validated)

| Param | Type | Notes |
|---|---|---|
| `range` | `today`, `7d`, `30d`, `90d`, `custom` | same set as F16 |
| `from`, `to` | unix ms | required when `range=custom` |
| `teamId` | string | VP only. Ignored for MANAGER (scope is always their team) |
| `sourceGroup` | SourceGroup enum | optional |
| `country` | ISO-3166 alpha-2 | optional |

Invalid → 400 `VALIDATION_ERROR`.

## 200 response

```jsonc
{
  "period": { "from": 0, "to": 0, "range": "90d" },
  "thresholds": { "conversionMinClosed": 20, "channelMinLeads": 30, "cellMinCount": 5 },
  "excluded": { "unknownAge": 312, "noModel": 58 },
  "availableCountries": ["AT","CH","DE"],
  "conversion": [
    { "band": "18-25", "closed": 64, "won": 12, "conversionPct": 18.8, "suppressed": false },
    { "band": "60+",   "closed": 7,  "suppressed": true }
  ],
  "orgConversionPct": 16.4,                       // null when no closed leads
  "channelMix": [
    { "band": "18-25", "n": 180, "shares": { "CALL": 14.4, "WHATSAPP": 57.8, "SMS": 12.2, "EMAIL": 15.6 }, "suppressed": false },
    { "band": "60+",   "n": 12,  "suppressed": true }
  ],
  "modelInterest": {
    "models": ["aurora-suv","metro-hatch","vento-sedan","terra-4x4","luma-ev","nova-van"],
    "rows": [
      { "band": "26-35", "n": 210, "cells": [
        { "model": "luma-ev", "count": 61, "sharePct": 29.0, "suppressed": false },
        { "model": "nova-van", "suppressed": true }
      ] }
    ]
  },
  "insights": { "conversion": "…" , "channelMix": "…", "modelInterest": "…" },   // each key omitted when all data is suppressed
  "generatedAt": 1759240000000
}
```

All five bands always appear in `conversion` and `channelMix` (in band order) and all six models in every heatmap row.

**Leak rule (SC-002)**: a `suppressed: true` entry contains only `band` (or `model`), `suppressed`, and, for conversion and channel rows, the sample size (`closed` / `n`). It never contains `won`, `conversionPct`, `shares`, `count` or `sharePct`.

## Errors
`{ "error": { "code": "FORBIDDEN" | "UNAUTHENTICATED" | "VALIDATION_ERROR", "message": "…" } }` with 403 / 401 / 400.
