# F{NN} — {Feature Name}

| Field | Value |
|---|---|
| **ID** | F{NN} |
| **Priority** | P0 / P1 / P2 |
| **Build wave** | 0–4 (see `README.md`) |
| **Depends on** | F.. |
| **Blocks** | F.. |
| **Personas** | REP / MANAGER / VP / BUYER |
| **Challenge req.** | R1 / R2 / R3 / — |
| **Owns (files/areas)** | Paths this feature may create or modify. Keeps parallel work conflict-free |

## 1. Summary
What it is and why it matters, in 2–4 sentences.

## 2. User Stories & Acceptance Scenarios
Prioritize the stories (P1 = must, P2 = should, P3 = nice). Each one must be **independently testable**.

### US-1 (P1): {title}
*As a {persona}, I want {capability} so that {benefit}.*

**Independent test:** how to verify this story on its own.

**Acceptance scenarios**
1. **Given** … **When** … **Then** …
2. …

## 3. Functional Requirements
- **FR-001**: The system MUST …
- **FR-002**: …
- Mark anything unresolved with `[NEEDS CLARIFICATION: …]`.

## 4. Key Entities & Data
The entities touched (reference `docs/03-domain-model.md`) and any fields this feature relies on.

## 5. Edge Cases & Error Handling
- …

## 6. Success Criteria (measurable, tech-agnostic)
- **SC-001**: …

## 7. UX Notes
Layout, states (loading / empty / error), copy, and accessibility.

## 8. Decisions
| # | Decision | Alternatives | Rationale |
|---|---|---|---|

## 9. Technical Plan Input (for `/speckit.plan`)
API endpoints, services, repositories, components, events emitted or consumed, cache keys, and tests to write.

## 10. Out of Scope
- …

## 11. Open Questions
- …

## 12. Spec Kit Prompts
**`/speckit.specify`** (what and why only, no tech):
> …

**`/speckit.plan`** (tech and constraints):
> …
