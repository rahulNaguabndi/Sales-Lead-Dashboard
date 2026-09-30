# Quickstart: validating F18

Prerequisites: `npm install`, `npm run db:reset` (seed), Redis optional. Use `PORT` if set; don't assume 3000.

1. **Fallback (no key)**: leave `ANTHROPIC_API_KEY` empty, `npm run dev`, log in as a rep, open a lead → card shows the "Rule-based" badge, summary, next best action, template draft.
2. **AI path**: set `ANTHROPIC_API_KEY`, reopen → "AI-generated" label; reopen again → instant cached result; log an activity → regenerates.
3. **Draft**: pick channel, click Draft, edit, Use draft → deep link opens, composer prefilled, saved activity shows "AI-assisted" chip.
4. **Unit**: `npm test -- ai` (scrubber, PII-free context over all seeded leads, rules, validator, fingerprint, SDK error mapping).
5. **E2E**: `npm run test:e2e -- ai-assist` (no-key badge; Use draft → chip).
6. **Eval** (manual, costs money): `npm run eval:ai` prints a table over 10 golden leads.
7. **RBAC**: out-of-scope lead → 403 on all three endpoints.

Contracts: [ai-endpoints.md](contracts/ai-endpoints.md) · Data: [data-model.md](data-model.md)
