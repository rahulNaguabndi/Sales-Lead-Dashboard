# F19 Assumptions (self-answered clarifications)

| Question | Answer | Source |
|---|---|---|
| Can managers see audit entries for their reps' logins? | Yes (actor in subtree) | F19 doc §11 |
| Where is `meta` stored / are append-only triggers present? | `meta json` column and BEFORE UPDATE/DELETE triggers come from F01 | F19 doc §11 |
| Are offer entries visible to managers? | No, VP only | F19 FR-007 |
| Does a hard dependency (F03) exist on this branch? | Not yet (spec-only run, wave 4 built later); plan codes against F03's `scopeFor`/policy interface | inferred |
| What if a lead moved teams? | Scope uses current team plus entries authored by the viewer | F19 doc §5 |
| What does a REP get on `/audit`? | 403 (page redirect, API 403) | F19 US-4 |
