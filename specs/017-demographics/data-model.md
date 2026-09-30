# F17 Data Model

F17 has **no schema changes and no writes**.

## Read sources

| Table | Columns used |
|---|---|
| `customers` | `id`, `age_band`, `preferred_channel`, `country` |
| `leads` | `customer_id`, `team_id`, `owner_id`, `source`, `stage`, `vehicle_model`, `created_at`, `closed_at` |

## Derived shapes (TypeScript / Zod, in `packages/shared/src/demographics.ts`)

```ts
DEMOGRAPHICS_MIN_SAMPLE = { conversionMinClosed: 20, channelMinLeads: 30, cellMinCount: 5 }
AGE_BANDS   = ['18-25','26-35','36-45','46-60','60+']           // UNKNOWN excluded
CHANNELS    = ['CALL','WHATSAPP','SMS','EMAIL']
MODELS      = ['aurora-suv','metro-hatch','vento-sedan','terra-4x4','luma-ev','nova-van']

RawDemographics {
  conversion:  { band, closed, won }[]
  channel:     { band, channel, n }[]
  model:       { band, model, n }[]
  orgClosed, orgWon, excludedUnknownAge, excludedNoModel, availableCountries
}

ConversionEntry = { band, closed, won, conversionPct, suppressed:false }
                | { band, closed, suppressed:true }
ChannelMixEntry = { band, n, shares:{CALL,WHATSAPP,SMS,EMAIL}, suppressed:false }
                | { band, n, suppressed:true }
HeatmapCell     = { model, count, sharePct, suppressed:false } | { model, suppressed:true }
HeatmapRow      = { band, n, cells: HeatmapCell[] }
```

## Metric definitions

- **Conversion %** = won ÷ (won + lost), leads with `closed_at` in period, one decimal.
- **Channel share** = leads of the band with that channel ÷ leads of the band created in period, one decimal. Sums to 100 ± rounding.
- **Heatmap row share** = leads of the band with that model ÷ leads of the band **with a model**, created in period.
- **Excluded**: `unknownAge` = in-scope leads (for the period, per chart basis: created-in-period) whose customer is `UNKNOWN`; `noModel` = in-scope known-age leads created in period with null model.
- Filters: period, scope (team/owner), `sourceGroup` → `source IN (…)` via shared source-group mapping, `country` → `customers.country`.
