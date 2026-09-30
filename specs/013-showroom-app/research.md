# Research: Showroom Mini App

| Topic | Decision | Rationale | Alternatives |
|---|---|---|---|
| Form validation | react-hook-form + `zodResolver(IntakeLeadSchema)` on a payload built from form values | One contract, no client/server drift (D3) | Hand-rolled validation; duplicated schema |
| Form value → payload | Separate `buildPayload()` pure function; the resolver validates the built payload via a wrapping resolver | Keeps phone/budget conversions unit-testable | Storing payload-shaped values in the form directly (dial code/budget range are UI-only) |
| HTTP | `fetch` + AbortController (10 s) | No dependency needed | axios |
| Server errors | Map `error.fields[].path` to RHF `setError`; unknown paths go to the banner | SC-003: no silent failures | Show generic banner only |
| Random data | Dynamic `import('@faker-js/faker')` and locale per country | SC-004 bundle budget | Static import; a handwritten name list |
| Mock mode | `VITE_MOCK_INTAKE=true` returns a fake `IntakeResponse` after 600 ms in `submitEnquiry` | Build before F10 (D6) | MSW |
| Testing | Vitest + Testing Library + jsdom; intake client tested with a stubbed `fetch` | Matches constitution's Vitest | Jest |
| Idempotency key | `crypto.randomUUID()` per form open | Retries never create duplicates (D7) | Body fallback field (shared schema has one, header wins) |
| Env | zod-parsed `import.meta.env`, defaults per FR-015; invalid URL fails loudly | Fail-fast misconfig | Unvalidated access |
| Ports | Read from env only | Parallel builds share the machine | Fixed 3001 in tests |
