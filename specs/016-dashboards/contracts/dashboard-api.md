# Dashboard API Contract

All endpoints: `GET`, authenticated (401 otherwise), filters validated by `DashboardFilterSchema`, scope enforced in the service. Common query: `range=today|7d|30d|90d|mtd|custom&from=&to=&teamId=&ownerId=&sourceGroup=`. Every response includes `scope`, `period`, `generatedAt`.

| Endpoint | Roles | Response (data part) |
|---|---|---|
| `/api/dashboard/summary` | all | `kpis{newLeads,coveragePct,avgFrtMinutes,conversionPct,revenueCents,overdueFollowUps}` each `{value,prev,series?,lowerIsBetter?}`; `strip{slaBreaches,pipelineValueCents,goingCold{atRisk,cold}}`. REP view adds `openLeads`, `dueToday`, and `touchesPerDay` |
| `/api/dashboard/charts/leads-over-time` | MANAGER, VP | `{bucket:"day"\|"week", groups[], rows[{d, <group>..., total}]}` (week buckets when span > 60 d; zero-filled) |
| `/api/dashboard/charts/funnel` | all | `{stages[{stage, reached, current}]}` for NEW, CONTACTED, QUALIFIED, TEST_DRIVE, NEGOTIATION, WON |
| `/api/dashboard/charts/sources` | MANAGER, VP | `{rows[{source, leads, won, lost, winRatePct}], orgWinRatePct}` sorted by volume |
| `/api/dashboard/charts/lost-reasons` | MANAGER, VP | `{rows[{reason, count, pct}]}` descending |
| `/api/dashboard/charts/stage-aging` | MANAGER, VP | `{rows[{stage, avgDays, targetDays, n}]}` |
| `/api/dashboard/leaderboard` | MANAGER, VP | `{rows[{userId,name,open,newInPeriod,contacted,coveragePct,avgFrtMinutes,slaBreaches,overdue,won,revenueCents}]}` (VP passes `teamId`) |
| `/api/dashboard/team-comparison` | VP | `{rows[{teamId,name, ...same metrics}]}` |

## Errors
- `400 {error:{code:"INVALID_RANGE"}}` — bad custom range. `400 {error:{code:"INVALID_FILTER", message:"Rep not in selected team"}}`.
- `403 {error:{code:"OUT_OF_SCOPE"}}` — team/rep outside scope, REP calling MANAGER/VP-only endpoints, MANAGER calling team-comparison.

## Drill-down (UI contract)
`buildInboxHref(filters, extra)` → `/inbox?view=&from=&to=&team=&owner=&source=&sourceGroup=&stage=&overdue=1&sla=breached`.
