# Implementation Plan: Customer Profile, Preferences & Channel Deep Links (F14)

**Branch**: `014-customer-channels` | **Date**: 2026-09-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/014-customer-channels/spec.md`

## Summary

Show the customer card and history on the lead detail page and let reps contact the customer on their preferred channel in one click. A `ChannelAdapter` interface with a `DeepLinkAdapter` implementation builds `wa.me`, `tel:`, `sms:` and `mailto:` links from pure builders in `packages/shared/src/channels.ts` (re-exported from `apps/web/server/channels`). Typed multilingual templates (7 languages × 5 keys) and `renderTemplate` live in `packages/shared/src/templates.ts`. `GET/PATCH /api/customers/:id` serve the profile (with scope-redacted history) and preference edits. React components plug into F05's detail-page slots and call F06's composer `prefill()` context. Clicking never writes to the DB.

## Technical Context

**Language/Version**: TypeScript (strict), Node ≥ 20

**Primary Dependencies**: Next.js App Router, React, TanStack Query, shadcn/ui (Popover, Dialog, Select, Tooltip), lucide-react, Zod, Drizzle (via repositories), `libphonenumber-js` (already in the stack, used by F01/F10; F14 only uses its formatter)

**Storage**: SQLite via existing repositories (no schema change; `customers`, `purchases`, `leads`, `activities`, `audit_log`)

**Testing**: Vitest (builders, templates, redaction, service), RBAC route tests, Playwright (click-to-prefill)

**Target Platform**: Web (desktop and mobile browsers)

**Project Type**: Web application (npm workspaces monorepo)

**Performance Goals**: Customer endpoint contributes to lead detail p95 < 300 ms; indexed lookups only (`purchases(customer_id)`, `leads(customer_id)` via customer FK)

**Constraints**: Stay within owned paths; slots.tsx registrations append-only; works with Redis down and without `ANTHROPIC_API_KEY`; no PII in logs

**Scale/Scope**: ~7 components, 2–3 routes, 35 templates

**New dependencies**: none. (`libphonenumber-js` is already a stack dependency from F01/F10; the shared formatter wrapper only imports it.)

## Constitution Check

| Principle | Status | Note |
|---|---|---|
| I Spec is truth | Pass | Doc amended if behavior deviates |
| II R1–R3 first | Pass | F14 adds to detail page slots only; no change to R1–R3 paths |
| III Layering | Pass | route → Zod → `authorize` → `customer-profile` service (under `server/channels/`) → repository; pure builders in shared |
| IV Security | Pass | GET/PATCH authorize via F03; history redaction; no PII logged; text rendered via React (no HTML) |
| V Test-first | Pass | builders/templates/redaction tests precede implementation; RBAC REP/MANAGER/VP in/out of scope; Playwright e2e |
| VI Integrity | Pass | PATCH writes customer update + audit + NOTE activity in one transaction; activities append-only; no click-time writes |
| VII Degradation | Pass | No Redis or AI dependency |
| VIII Simplicity | Pass | Only the documented ChannelAdapter extension point; no new deps |
| IX Performance | Pass | Single history query joined by customer id; no N+1 (owner names joined) |
| X UX | Pass | Loading/empty/error states, text labels on icons, keyboard accessible |

Post-design re-check: pass.

## Project Structure

### Documentation (this feature)

```text
specs/014-customer-channels/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── assumptions.md
├── contracts/customers-api.md
└── tasks.md
```

### Source Code (owned paths only)

```text
packages/shared/src/
├── channels.ts            # pure builders: buildWhatsAppLink, buildTelLink, buildSmsLink, buildMailtoLink, channelAvailability, truncateMessage (new, F14)
├── templates.ts           # TEMPLATES[key][lang], TemplateKey, renderTemplate, resolveTemplateLang (append-only per README)
├── customer-timezone.ts   # country→timezone, best-time windows, isOutsideBestTime (new; pure)
└── schemas/customer.ts    # Zod: PatchPreferencesSchema, CustomerProfile response types (new file; index export appended)

apps/web/
├── server/channels/
│   ├── ChannelAdapter.ts  # interface
│   ├── DeepLinkAdapter.ts # implements via shared builders; send undefined
│   ├── customer-profile.ts# service: getProfile(user, id), updatePreferences(user, id, patch) (history redaction, transaction, audit, NOTE activity)
│   └── index.ts
├── app/api/customers/[id]/route.ts            # GET, PATCH (thin)
├── app/api/leads/[id]/contact-link/route.ts   # GET optional server-side builder
├── components/leads/customer/{CustomerCard,HistoryCard,EditPreferencesDialog}.tsx
├── components/leads/channels/{ChannelBar,TemplatePicker,BestTimeHint}.tsx
├── components/leads/detail/slots.tsx          # append-only: register customer card, history card, channel bar
└── tests/ (unit + e2e under existing layout)
```

**Structure Decision**: Pure logic (links, templates, timezone) in `packages/shared` so the client builds links with zero round trips and F18 can reuse templates. Server-only logic (profile, redaction, preference update) in `server/channels/customer-profile.ts` because `server/services/**` is owned by other features. Repository access for customers/purchases/leads reuses F01 repositories; if a needed query is missing, it is added as an append-only export in the customer repository.

## Key Design Decisions

1. **Links built client-side** from shared builders; `contact-link` endpoint is optional convenience and calls the same builders after authorizing the lead.
2. **Anchors, not `window.open`**: WhatsApp is `<a target="_blank" rel="noopener">`; the anchor's click handler calls `composer.prefill(...)` without preventing default.
3. **Prefill contract** (F06): `composer.prefill({ type, note, channel, aiAssisted: false })`; Call uses note "Called customer" and focuses outcome; others focus outcome after prefill.
4. **Redaction**: service compares each past lead against `scopeFor(user)`; out-of-scope leads map to `{reference, stage, createdAt, inScope:false}` (no id, owner).
5. **Preference PATCH**: Zod-validated (enum values, language must be ISO-639-1), authorize `lead:write` against one in-scope lead of the customer, then a single transaction: update customer, write audit (before/after), insert SYSTEM NOTE activity on the viewed lead (passed as `leadId` in the body, must belong to the customer and be in scope) with "Preferences updated: WhatsApp → Call".
6. **Timezone**: `Intl.DateTimeFormat` with the mapped IANA zone; fallback Europe/Berlin.
7. **Truncation**: message capped at 1,000 chars with a UI warning.

## Complexity Tracking

None. No constitution violations.
