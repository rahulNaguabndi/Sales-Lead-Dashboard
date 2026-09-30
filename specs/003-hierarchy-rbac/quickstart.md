# F03 Quickstart

```bash
npm run db:reset                       # F01: seeded org (16 users, 3 teams)
npx vitest run apps/web/server/policy  # matrix, scope, filter, sweep, perf
```

Usage in a route handler:

```ts
export const GET = withAuthz(async ({ resource }) => Response.json(resource), {
  action: 'lead:read',
  loadResource: async ({ id }) => {
    const lead = await getLeadRow(id);
    return lead ? { kind: 'lead', lead } : undefined;
  },
});
```

List queries: `db.select().from(leads).where(leadScopeWhere(await getScope(user.id)))`.
