# Data Model: Showroom Mini App

No database access. Types come from `@leaddesk/shared` (`IntakeLead`, `IntakeResponse`, `VEHICLES`, `COUNTRIES`, `formatEUR`).

## EnquiryFormValues (UI only)

| Field | Type | Notes |
|---|---|---|
| firstName, lastName | string | 1–60 |
| email | string | required per channel rules |
| dial | country code key | from `COUNTRIES[country].dial`; follows country |
| phoneDigits | string | digits kept when the country changes |
| country | CountryCode | sets dial, language |
| city | string | ≤ 80 |
| ageBand | AgeBand | default UNKNOWN |
| language | Language | default `COUNTRIES[country].lang` |
| preferredChannel | Channel | tile selector |
| bestTime | BestTime | default ANYTIME |
| vehicleModel | slug or `''` | `''` → omitted |
| budgetRange | `'' | LT20 | 20_30 | 30_40 | 40_55 | GE55` | → cents (see below) |
| hasTradeIn, wantsFinance, testDriveRequested | boolean | |
| message | string | ≤ 2000, counter ≥ 1,800 |
| marketingConsent | boolean | default false |
| website | string | honeypot |

## Derived payload (`buildPayload`)

- `phone` = `+<dial><digits>` after stripping leading `+`, `00` and a duplicated dial code; omitted when digits empty.
- Budget: LT20 → `budgetMax=2_000_000`; 20_30 → 2_000_000–3_000_000; 30_40 → 3_000_000–4_000_000; 40_55 → 4_000_000–5_500_000; GE55 → `budgetMin=5_500_000`.
- Empty strings omitted; `source`/`sourceDetail` from the demo selection (default WEBSITE, none).

## DemoSource (localStorage `showroom.demo.source`)

`{ source: LeadSource, detail: string }`; options per FR-011; defaults: FACEBOOK→`autumn-suv`, INSTAGRAM→`autumn-suv`, GOOGLE_ADS→`eurodrive suv deals`, REFERRAL→`Maria Keller`, PORTAL→`mobile.de`, WEBSITE→none.

## Thank-you state

`{ reference: string | null, firstName, channel, bestTime, language }` in router state; `?ref=` fallback.
