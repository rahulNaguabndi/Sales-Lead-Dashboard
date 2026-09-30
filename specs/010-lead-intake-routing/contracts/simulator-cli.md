# Contract: `npm run simulate -- [flags]`

| Flag | Default | Meaning |
|---|---|---|
| `--url` | `http://localhost:3000/api/intake/leads` | Target |
| `--key` | env `INTAKE_API_KEY`, else `showroom-dev-key` | `X-API-Key` |
| `--rate` | 12 | Leads per minute |
| `--count` | 20 | `0` = until Ctrl+C |
| `--seed` | random | A fixed value gives reproducible output |
| `--returning` | 0.15 | Share (0–1) reusing seeded customer phones |
| `--countries` | all | CSV of ISO2 codes |
| `--burst` | off | Send all concurrently |
| `--fail-fast` | off | Exit code 1 on the first error |

Line per lead: `✔ EDM-2026-00813  Lena Braun (DE, de)  aurora-suv  FACEBOOK  → Team DACH / Anna Weber  HOT 74` (green ✔ assigned, yellow ◌ pool, red ✖ error). Summary at the end: sent, assigned, pool, returning, errors, average latency.

The public response carries no team or score, so the line shows the assignee first name, and team and score only when the response provides them.
