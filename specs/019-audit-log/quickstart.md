# Quickstart: validating F19

Prerequisites: F01–F03 (and producers F02/F06/F07/F10/F11 as available) merged; `npm run db:reset`.

1. Unit/integration: `npm test -- audit` — scope predicate (REP/MANAGER/VP), keyset pagination, redaction, `summarize`, rollback leaves no orphan entries, append-only triggers.
2. Manual: `npm run dev`, sign in as Lukas (manager), reassign a lead, open the lead → "Audit trail" → see `lead.assigned` with `Owner: Anna Weber → Jonas Fischer`.
3. VP: `/audit?action=offer.*` lists offer entries only; Team DACH manager sees none of them.
4. REP: `/audit` → 403 and no nav item.
5. e2e: `PORT=<free> npm run test:e2e -- audit`.

Contract: [contracts/audit-api.md](contracts/audit-api.md). Data: [data-model.md](data-model.md).
