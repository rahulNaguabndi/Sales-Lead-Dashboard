# Research: F04 Lead Inbox

| Decision | Choice | Rationale / alternatives |
|---|---|---|
| Filtering/sorting/paging | Server-side SQL via Drizzle | Scope enforced in SQL; client-side filtering rejected |
| Ranking | `ORDER BY overdue DESC, sla DESC, score DESC, created_at DESC, id DESC` with computed columns from correlated subqueries | Multi-key computed rank; keyset rejected |
| Pagination | Offset (`page`, `pageSize`) | Page numbers needed; revisit with Postgres |
| Out-of-scope filters | Intersect with scope | Never 403 (no existence leak) |
| Counts | One aggregate query with `SUM(CASE…)` | Avoids N count queries |
| Search | Normalized `customers.search_text LIKE '%q%'` OR `reference LIKE 'q%'` | Accent-insensitive via F01 column; reuse F01 normalizer |
| State | URL search params source of truth | Shareable; RSC-friendly |
| First paint | RSC calls `listLeads` directly, hands `initialData` to TanStack Query | Fast first paint |
| Table | TanStack Table (headless) + shadcn/ui | Already in the stack |
| Live | `useInboxLive()` stub in `live-slot.ts` | F12 replaces body only |

No new runtime dependencies (TanStack Query/Table, Zod, Drizzle come from F01). A tiny `COUNTRY flag` helper uses regional-indicator emoji (no dependency).
