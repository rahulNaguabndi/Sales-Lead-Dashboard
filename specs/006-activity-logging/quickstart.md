# Quickstart: validating F06

Prerequisites: F01 foundation merged, `npm install`, `npm run db:reset`. Redis is optional. Respect `PORT` if set.

1. **Unit + integration**: `npm test` (truth tables, schema rules, transaction/fault injection, idempotency, 409/403/404, simulated restart).
2. **Run**: `npm run dev`, log in as Sofia (rep), open the first inbox lead.
3. **Log**: choose Call → Connected → "Called customer" → Ctrl/⌘+Enter. Expect the entry at the top immediately, then confirmed.
4. **Persist**: reload → entry still present; restart the server → still present; inbox row shows "Call · just now".
5. **Validation**: empty note disables submit; Note hides outcome; 2001 chars turns the counter red.
6. **Bookkeeping**: on a NEW lead a Call moves it to CONTACTED with a system entry; a Note does not.
7. **E2E**: `npm run test:e2e -- core-loop` (login → inbox → lead → log → reload → still there; empty note → submit disabled).

Contract: [contracts/post-activity.md](contracts/post-activity.md) · Data: [data-model.md](data-model.md)
