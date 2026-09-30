# Contract: @leaddesk/shared

**Phase 1 output** | Package: `packages/shared` | Consumed by: `apps/web`, `apps/showroom`, simulator

This package is the **single source of truth** for all shared domain vocabulary. It is
consumed as TypeScript source (no build step). Every enum is exported as both a readonly
tuple (for Zod and seed use) and a TypeScript union type so exhaustive switches catch
missing cases at compile time.

---

## `IntakeLeadSchema` (`schemas/intake.ts`)

The public enquiry contract — shared by the showroom (F13), the intake API (F10), and the
lead simulator (F10). A payload that passes this schema is safe to write to the database.

```ts
IntakeLeadSchema = z.object({
  firstName:         z.string().trim().min(1).max(60),
  lastName:          z.string().trim().min(1).max(60),
  email:             z.string().trim().toLowerCase().email().max(254).optional(),
  phone:             z.string().trim().regex(/^\+?[0-9 ()-]{6,20}$/).optional(),
  country:           z.enum(COUNTRY_CODES),
  city:              z.string().trim().max(80).optional(),
  age:               z.number().int().min(18).max(100).optional(),
  ageBand:           z.enum(AGE_BANDS).default('UNKNOWN'),
  language:          z.enum(LANGUAGES),
  preferredChannel:  z.enum(CHANNELS),
  secondaryChannel:  z.enum(CHANNELS).optional(),
  bestTime:          z.enum(BEST_TIMES).default('ANYTIME'),
  vehicleModel:      z.enum(VEHICLE_SLUGS).optional(),
  budgetMin:         z.number().int().nonnegative().optional(),   // euro cents
  budgetMax:         z.number().int().positive().max(50_000_000).optional(),
  hasTradeIn:        z.boolean().default(false),
  wantsFinance:      z.boolean().default(false),
  testDriveRequested: z.boolean().default(false),
  message:           z.string().trim().max(2000).optional(),
  source:            z.enum(LEAD_SOURCES).default('WEBSITE'),
  sourceDetail:      z.string().trim().max(120).optional(),
  marketingConsent:  z.boolean().default(false),
  idempotencyKey:    z.string().max(64).optional(),               // body fallback; Idempotency-Key header wins
  website:           z.string().optional(),                       // honeypot: F10 checks non-empty → 202, no write
})
.refine(d => d.email || d.phone, { message: 'Email or phone is required', path: ['email'] })
.refine(d => d.preferredChannel === 'EMAIL' ? !!d.email : !!d.phone, {
  message: 'Contact detail for preferred channel is required', path: ['preferredChannel'] })
.refine(d => d.budgetMin == null || d.budgetMax == null || d.budgetMin <= d.budgetMax, {
  message: 'Minimum budget exceeds maximum', path: ['budgetMin'] });
```

**Intake response** (`IntakeResponseSchema`):
```ts
{ reference: string; status: 'created' | 'duplicate';
  assignedTo: { firstName: string } | null;
  expectedContact: { channel: Channel; bestTime: BestTime }; }
```

---

## `CreateActivitySchema` (`schemas/activity.ts`)

Request body for `POST /api/leads/:id/activities`. F06 owns the behavioural rules
(outcome validation, side-effects); F01 ships the base schema.

```ts
CreateActivitySchema = z.object({
  clientRequestId:   z.string().length(26),          // ULID for idempotency
  type:              z.enum(USER_ACTIVITY_TYPES),
  outcome:           z.enum(OUTCOMES).optional(),    // outcome rules: see F06 FR-002
  note:              z.string().trim().min(1).max(2000),
  aiAssisted:        z.boolean().default(false),
  nextFollowUp:      z.object({
    dueAt: z.string().datetime(),
    note:  z.string().trim().max(200).optional(),
  }).optional(),
  completeFollowUpId: z.string().optional(),
  stageChange:       z.object({ to: z.enum(OPEN_STAGES) }).optional(),
  expectedVersion:   z.number().int().optional(),     // optimistic concurrency
});
```

---

## `LeadListQuerySchema` (`schemas/lead-filters.ts`)

Query parameters for `GET /api/leads`. F04 owns the filter semantics; F01 ships the base
schema. CSV params are parsed via a `csv()` helper that splits on commas.

```ts
LeadListQuerySchema = z.object({
  view:        z.enum(['mine','unassigned','due_today','going_cold','team','all']).optional(),
  stage:       csv(z.enum(STAGES)).optional(),
  source:      csv(z.enum(LEAD_SOURCES)).optional(),
  priority:    csv(z.enum(PRIORITIES)).optional(),
  owner:       csv(z.string()).optional(),      // user ids or 'unassigned' (MANAGER/VP)
  team:        csv(z.string()).optional(),      // VP only
  returning:   zBool.optional(),
  overdue:     zBool.optional(),
  closed:      zBool.optional(),
  sla:         z.enum(['breached']).optional(),
  sourceGroup: z.enum(SOURCE_GROUPS).optional(),
  createdFrom: z.string().date().optional(),
  createdTo:   z.string().date().optional(),
  q:           z.string().trim().min(2).max(100).optional(),
  sort:        z.enum(['rank','newest','oldest_untouched','next_follow_up','score','last_activity'])
               .default('rank'),
  page:        z.coerce.number().int().min(1).default(1),
  pageSize:    z.coerce.number().int().refine(n => [10,25,50].includes(n)).default(25),
  tz:          z.string().default('Europe/Berlin'),
});
```

---

## `ApiError` / `Paginated<T>` (`schemas/common.ts`)

```ts
type ApiError = {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;  // field path → message for 400 VALIDATION_ERROR
  };
};

type Paginated<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
};
```

---

## Format Utilities (`format.ts`)

```ts
formatEUR(cents: number): string
// Default locale de-DE → "38.900 €". Locale is configurable via the module's constant.

formatRelative(ms: number): string
// "2 hours ago", "yesterday", etc.

formatDateTime(ms: number): string
// 24-hour format, e.g. "30 Sep 2026, 14:32"

buildCustomerSearchText(c: {
  firstName: string; lastName: string;
  email?: string | null; phone?: string | null;
}): string
// lowercased, diacritics stripped (NFD + remove combining marks),
// concatenation of first_name + ' ' + last_name + ' ' + email + ' ' + phone-digits-only
```
