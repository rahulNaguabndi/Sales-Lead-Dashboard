# F15 Assumptions (self-answered clarifications)

| Question | Answer | Source |
|---|---|---|
| Deduct offer value from deal value at WON? | No. Rep enters final deal value, offer is recorded for attribution. | F15 doc §11 recommendation |
| Timezone for validity boundaries? | Europe/Brussels end of day, stored as UTC ms. | F15 doc §11 / FR-002 |
| Offer for unknown eligibility keys? | Fail closed (not matching, warning logged). | FR-003 / Decision 3 |
| Upper bound for finance rate? | 2000 bps (20 %). | F15 doc §5 |
| Can non-VP see inactive/expired offers? | No, only active and scheduled. | US-3.5 |
| Does F15 cache the active list? | Optional via the cache interface, key `cache:offers:active`; TTL decided by F20. Works without cache. | FR-008 |
| Live preview "matches N open leads"? | P2, optional. | F15 doc §7 |
| "Use in message" template picker? | Owned by F14; F15 only links. | inferred |
| WON dialog/endpoint ownership? | F07 owns it. F15 exports the matcher and a validation helper that F07 calls. | README soft dependency |

## T001 findings (F01 scaffolding audit)

- Shared index, `offers` table, cache (`server/cache/cache.ts`), bus, `writeAudit`, `authorize` with `offer:read` and `offer:manage` (VP only) all exist: no stub needed for `offer:manage`.
- `components/leads/detail/slots.tsx` has an `offers` slot (null); the top bar has a `data-slot="offers-strip"` mount point; the nav already has the "Offers" entry. F15 fills them append-only.
- **Requires F01 change**: the seed (`server/db/seed/offers.ts`) does not contain the six offers of FR-011. It has Loyalty Bonus, Autumn Cashback, Trade-in Boost, 0% APR Finance, EV Switch Grant and an expired "Summer Sale"; there is no "Winter Trade-in Bonus" and the expired one is named "Summer Sale" rather than "Summer EV Cashback". The seed was not edited. Tests and e2e use the seeded names and create other offers on demand.
- Live: `offer.changed` already invalidates the `['offers']` and `['lead']` query keys in `lib/sse/invalidation.ts`, so F15 queries use those key prefixes.
