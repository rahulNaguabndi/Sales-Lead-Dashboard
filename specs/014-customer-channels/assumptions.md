# F14 Assumptions (self-answered clarifications)

| # | Question | Answer | Source |
|---|---|---|---|
| 1 | Hard dependencies F05/F06 (wave 2) are not on this branch. Block? | No: this is spec-only; code against the slot/prefill interfaces named in the F14 doc and stub until merge. | inferred (spec-only mode) |
| 2 | Can name/phone/email be edited on the customer card? | No, preferences only. | F14 §11 proposal |
| 3 | Does the showroom capture a secondary channel? | Out of scope for F14; optional, coordinated with F13. | F14 §11 proposal |
| 4 | Server-side contact-link endpoint or client-built links? | Client builds links from shared pure code; the endpoint is optional and stays thin and delegates to the same builders. | F14 §9 |
| 5 | Scope of "lead-write" for PATCH? | Caller must be authorized `lead:write` on at least one of the customer's leads in scope (F03 policy). | F14 FR-009 |
| 6 | Which activity does preference editing produce? | Audit row plus a NOTE system activity on the lead being viewed, message "Preferences updated: A → B". Written in one transaction. | F14 US-5, constitution VI |
| 7 | Truncation of long messages? | 1,000 chars with a visible warning. | F14 §5 |
| 8 | Outside-best-time hint for ANYTIME? | No hint. | inferred |
| 9 | Timezone for countries not in the map? | Fall back to Europe/Berlin, hint still shown. | inferred (only EU markets seeded) |
| 10 | Default template per channel? | `first_contact` when the lead has no contact activity, else `follow_up`; CALL uses no template. | inferred |
| 11 | Doc's `GET/PATCH /api/customers/:id` has no lead context, but RBAC and the NOTE activity need one. | GET takes `?leadId=` and PATCH takes `leadId` in the body; the lead must belong to the customer and be in scope. `docs/features/F14-customer-channels.md` §9 is amended in the same branch (Constitution I). | inferred (analyze finding) |
| 12 | New shared files outside the literal owned list (`customer-timezone.ts`, `schemas/customer.ts`, `channels.ts`)? | Additive new files inside `packages/shared` with append-only index exports; no edits to other features' files. `channels.ts` is named in F14 §9. | inferred |
| 13 | How is the SYSTEM NOTE written (F06 owns activity service)? | Inserted via the activities repository inside the preferences transaction; no change to F06 files. | inferred |
