# Data Model: F07 (no schema changes — see docs/03-domain-model.md)

## Fields written
| Table | Columns | When |
|---|---|---|
| `leads` | `stage`, `updated_at`, `version+1` | every change |
| `leads` | `deal_value`, `applied_offer_id`, `closed_at` | WON |
| `leads` | `lost_reason`, `lost_note`, `closed_at` | LOST |
| `leads` | `closed_at`, `lost_reason`, `lost_note` → NULL | reopen (LOST→CONTACTED) |
| `leads` | `attempt_count = 0` | COLD→CONTACTED revive |
| `stage_history` | `from_stage,to_stage,changed_by,reason,changed_at` | every change |
| `activities` | `STAGE_CHANGED` `{from,to,reason?}`; `OFFER_APPLIED` `{offerId}` | every change / WON with offer |
| `follow_ups` | `status: PENDING → CANCELLED` | WON or LOST |
| `purchases` | `customer_id,lead_id,vehicle_model,amount` | WON |
| `customers` | `is_returning = 1` | WON |

## Validation
- WON: `dealValue` int, 1 ≤ v ≤ 100,000,000; `vehicleModel` in catalog (defaults to lead's); `appliedOfferId` optional and must be in current matches.
- LOST: `lostReason` ∈ LostReason; OTHER ⇒ `lostNote` 3–500 chars.
- `version` required (except internal system calls).

## Transition table (open = NEW,CONTACTED,QUALIFIED,TEST_DRIVE,NEGOTIATION)
open→later open (forward per diagram, incl. QUALIFIED→NEGOTIATION), open→earlier open, open→LOST, open→COLD (system or MANAGER/VP), NEGOTIATION→WON, COLD→CONTACTED, LOST→CONTACTED (MANAGER/VP), WON terminal.

## Data-level guarantee (SC-003)
Service rejects WON without `deal_value` and LOST without `lost_reason`; verified by service test (no schema CHECK added since schema is F01-owned — logged as follow-up).
