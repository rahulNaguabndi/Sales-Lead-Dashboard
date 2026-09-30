# Implementation Plan: Showroom Mini App (Lead Generation)

**Branch**: `013-showroom-app` | **Date**: 2026-09-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/013-showroom-app/spec.md`

## Summary

Build the public EuroDrive Motors site in `apps/showroom` (Vite + React + TS + Tailwind, port 3001): a catalog grid with filters, a model page, an enquiry sheet whose form is validated by the shared `IntakeLeadSchema`, a typed intake client (`POST` with `X-API-Key` and `Idempotency-Key`, 10 s timeout, error union), a thank-you page, and a demo toolbar (traffic source, lazy-loaded faker prefill, burst of 5). A mock mode lets it work before F10 exists. No server, DB, Redis or AI involvement (Redis/AI degradation is N/A; the showroom has no optional dependency).

## Technical Context

**Language/Version**: TypeScript strict, React 18, Vite 5 (as scaffolded by F01)

**Primary Dependencies**: react-router-dom, react-hook-form, @hookform/resolvers, zod, @leaddesk/shared (workspace), @faker-js/faker (dynamic import), tailwindcss

**Storage**: none; only `localStorage` for the demo-toolbar source selection

**Testing**: Vitest + @testing-library/react + jsdom (unit/component); Playwright e2e is wave 2+ (needs F10/F12), authored but skipped when the intake API is unreachable

**Target Platform**: modern browsers; dev server on `SHOWROOM_PORT` (default 3001)

**Project Type**: web application (single SPA in an npm-workspaces monorepo)

**Performance Goals**: production bundle < 250 KB gzipped (faker lazy chunk excluded); form usable in < 60 s

**Constraints**: works offline (no external images/fonts); no hardcoded ports in tests; A11y score ≥ 95

**Scale/Scope**: 4 routes, 6 vehicles, 1 form, 1 toolbar

## Constitution Check

| Principle | Status |
|---|---|
| I Spec is truth | PASS. Spec carries F13 doc; deviations get amended in the doc. |
| II R1–R3 first | PASS. Showroom is P1 but touches none of R1–R3 code. |
| III Layered architecture | PASS. Showroom only imports `@leaddesk/shared`; network access isolated in `lib/intake-client.ts`; components never call `fetch`. |
| IV Security | PASS. Input validated with shared Zod schema; API key is a channel identifier (D2), no tokens/PII in storage or logs (only source selection in localStorage). |
| V Test-first | PASS. Pure logic (phone combine, budget→cents, payload builder, error mapping, prefill) gets tests before implementation; no lead-scoped endpoints so no RBAC tests; e2e per spec. |
| VI Data integrity | PASS. Money in cents; no persistence. |
| VII Graceful degradation | PASS. Service down → banner + Retry; mock mode without backend. |
| VIII Simplicity | PASS. New deps justified below. |
| IX Performance | PASS. Lazy faker chunk. |
| X UX | PASS. Loading/error states, a11y (FR-017). |

No violations; Complexity Tracking not needed.

## Dependencies (new, each justified)

| Dependency | Why |
|---|---|
| react-router-dom | The three routes plus 404 and router state for thank-you (FR-001, FR-009). |
| react-hook-form + @hookform/resolvers | Form state and shared-Zod validation with server-error mapping via `setError` (FR-006). |
| zod | Needed for `lib/env.ts` and the resolver; same major version as `@leaddesk/shared`. |
| @faker-js/faker | Locale-correct prefill (FR-012); dynamic import keeps it out of the main bundle. |
| tailwindcss (+ postcss, autoprefixer) | Already the stack per constitution; F01 scaffold may include it, otherwise added. |
| vitest, jsdom, @testing-library/react, @testing-library/user-event, @testing-library/jest-dom | Component tests required by F13 §9. |

`apps/showroom/package.json`, `vite.config.ts` and `tailwind.config` are F01 scaffold files outside the owned paths (`apps/showroom/src/**`, `.env.example`, `index.html`). Dependency additions to `apps/showroom/package.json` and a `test` block in its Vite config are **append-only shared edits**; nothing existing is reordered. F01's scaffold `.env.example` (`VITE_API_URL`/`VITE_API_KEY`) is replaced with the FR-015 variables because F13 owns that file.

## Project Structure

### Documentation (this feature)

```text
specs/013-showroom-app/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/intake-client.md
├── assumptions.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code

```text
apps/showroom/
├── index.html                    (owned)
├── .env.example                  (owned)
└── src/                          (owned)
    ├── main.tsx, App.tsx         router: /, /models/:slug, /thank-you, *
    ├── pages/                    Home, ModelDetail, ThankYou, NotFound
    ├── components/
    │   ├── VehicleCard.tsx, VehicleArt.tsx (inline SVG per slug), Filters.tsx
    │   ├── enquiry/              EnquirySheet, EnquiryForm, ChannelTiles, PhoneInput, BudgetSelect
    │   └── demo/                 DemoToolbar, prefill.ts (lazy faker), burst.ts, sources.ts
    ├── lib/
    │   ├── intake-client.ts      submitEnquiry(payload, key) → Result
    │   ├── env.ts                zod-validated import.meta.env
    │   ├── payload.ts            form values → IntakeLead (phone combine, budget cents, model omit)
    │   ├── errors.ts             IntakeError → banner/field messages
    │   └── budget.ts, phone.ts   pure helpers
    └── test/                     setup.ts + *.test.ts(x) beside sources
```

**Structure Decision**: single SPA; pure logic split into `lib/*` modules so it can be unit-tested before components.

## Design Notes

- **Contract**: see [contracts/intake-client.md](contracts/intake-client.md). `IntakeLeadSchema` already enforces "email or phone" and "contact detail for preferred channel"; the form adds a form-level message "Please give us an email or phone number." and per-field mapping of those refinement paths.
- **Idempotency key**: `crypto.randomUUID()` created when the enquiry sheet opens (and refreshed after success); held in a ref so retries reuse it (FR-008).
- **Response statuses**: 201 and 200 → `IntakeResponseSchema`; 202 → generic thank-you without reference (clarification); 400 → validation fields; 401, 413, 429, timeout (AbortController), network, other 5xx/4xx → error union.
- **Thank-you**: router state `{reference, name, channel, bestTime, language}` plus `?ref=`; heading focused on mount.
- **Draft persistence**: the form lives in the page-level provider, so closing the sheet keeps values in memory.
- **Demo**: `VITE_SHOW_DEMO_TOOLBAR=false` hides it; source selection in `localStorage` key `showroom.demo.source`; `prefill.ts` does `await import('@faker-js/faker')` with age-band channel weights from F01 FR-033.
- **Ports**: no hardcoded ports in code; `VITE_INTAKE_URL` env only; Playwright config reads `SHOWROOM_PORT`.
- **Cross-feature**: FR-016 (CORS, idempotency) is implemented by F10; recorded under "Requires other-feature changes" in the report.
