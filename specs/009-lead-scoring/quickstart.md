# Quickstart: F09

```bash
npm test -- scoring            # unit: worked examples A–G, SLA table, edge cases
npm test -- scoring-service    # integration: recompute + SCORE_CHANGED
npm run db:reset               # seed now carries real scores
```

Manual: open a lead detail (F05), hover the score badge to see five factor bars and reasons. Log an INTERESTED outcome (F06); the score and band update in the same transaction.
