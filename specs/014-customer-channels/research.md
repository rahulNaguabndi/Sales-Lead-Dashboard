# Research: F14 Customer Channels

No NEEDS CLARIFICATION remain. Decisions:

| Topic | Decision | Rationale | Alternatives |
|---|---|---|---|
| Link construction | Pure builders in `packages/shared`, used by client and server | No round trip; unit-testable; reusable by F18 | Server-only endpoint |
| SMS link form | `sms:<E164>?&body=<enc>` | Works on iOS and Android | `?body=` (iOS-incompatible) or `&body=` |
| Opening links | Real anchors (`target=_blank rel=noopener`) | Immune to pop-up blockers | `window.open` |
| Phone display | `libphonenumber-js` `formatInternational()` | Already in stack | Custom formatting |
| Templates | Typed TS module, 7×5 | Type-checked, versioned in git | DB-managed, i18n lib |
| Timezone | Country → IANA map + `Intl.DateTimeFormat` | No new dependency; EU coverage | Per-customer stored timezone |
| History redaction | Service-level mapping using caller scope | Constitution IV; rep knows history exists | Hide out-of-scope leads |
| Preference-edit log | Audit row + NOTE system activity in one transaction | Constitution VI | Audit only |
| Write target for PATCH note | Lead the rep is viewing (`leadId` in body) | Activities are lead-scoped | Every lead of the customer |
| Click logging | None server-side | FR-007 | Auto-log on click |
