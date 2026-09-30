# F04 Assumptions (self-answered clarifications)

| # | Question | Answer | Source |
|---|---|---|---|
| 1 | Should managers who also own leads see My Leads? | Show My Leads only when they own ≥ 1 lead; default tab stays Team/All. | F04 §11 |
| 2 | "Going Cold" uses last activity or last contact? | `coalesce(last_contact_at, created_at)` ≤ now − 3 days (stage NEW…NEGOTIATION), oldest first. US-3 wording says "last activity" but the domain model states cold timers use `last_contact_at`. Spec text says "last contact". | 03-domain-model §leads (inferred) |
| 3 | Name of the scope helper (F04 doc says `scopeFilter(user)`, F03 plan says `getScope` + `leadScopeWhere(scope)`). | Code against F03's `getScope(user)` + `leadScopeWhere(scope)`; wrap in a thin local `scopeFilter(user)` adapter in `lead-query.ts` so either name works. Stub if F03 not merged. | F03 §12 (inferred) |
| 4 | Is the `team` filter/`owner` filter allowed for REP? | Ignored silently for REP (`owner`, `team`); `team` only honoured for VP. Never 403. | FR-006, FR-014 |
| 5 | Is `all` distinct from `team`? | Same query; `all` is a VP alias. MANAGER requesting `all` is treated as `team`; REP requesting `team`/`all` falls back to `mine`. | FR-002 (inferred) |
| 6 | Overdue definition | PENDING follow-up with `due_at < now`, any follow-up assigned to anyone on the lead. | F04 §9 |
| 7 | "Due Today" boundary | end of today in `tz` (start of tomorrow, exclusive), includes overdue. Only PENDING follow-ups. | F04 US-3 |
| 8 | Stat chip / tab count scope | Default scope of the user with the default closed/COLD exclusion; `mine` counts only own open leads. | F04 US-6, FR-009 |
| 9 | Row summary "Called · 3 h ago" source | Latest USER activity (notes included) per lead; type label + relative time. | F04 §9 |
| 10 | `atRisk` flag in response | Computed as open lead with `coalesce(last_contact_at, created_at)` older than 2 days and not yet cold (informational only, not ranked). | inferred from domain model |
| 11 | Live-slot when F12 absent | `useInboxLive()` returns an empty `Set`. | F04 §9 |
| 12 | E2E file `tests/e2e/core-loop.spec.ts` is shared with F05/F06. | F04 creates the file with the inbox steps; F05/F06 append steps. Merge conflicts resolved at integration. | F04 §9 |
