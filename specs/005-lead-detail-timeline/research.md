# Research: F05 Lead Detail & Timeline

All items resolved; no NEEDS CLARIFICATION.

| Topic | Decision | Rationale | Alternatives |
|---|---|---|---|
| Pagination | Keyset on `(created_at, id)`, opaque base64url cursor | Stable under inserts at the top; uses `activities(lead_id, created_at)` index | Offset (unstable) |
| Out-of-scope response | 404 identical to missing | No existence leak (spec FR-003) | 403 |
| Initial data | RSC fetch + dehydrated TanStack Query cache | Fast first paint; shared keys for F06/F12 | Client-only fetch |
| Order preference | localStorage, read post-mount | Persists across leads/reloads; avoids hydration mismatch | Cookie, server preference |
| System entries | One `formatSystemActivity` map, generic fallback | One place to extend; unknown types don't crash | Stored text |
| Slot mechanism | Typed record of nullable components in `slots.tsx` | Append-only edits, no page changes | Context/registry at runtime |
| Relative time | Client component, 60 s interval, `<time dateTime>` + title | FR-006 | Server-formatted |
| Unavailable soft deps | Code to F02/F03 interfaces, stub locally until merge | Parallel build | Wait for merge |
