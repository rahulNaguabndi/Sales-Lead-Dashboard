# Contract: client event handling

| Event | Invalidate (debounced 250 ms per key) | Toast |
|---|---|---|
| `lead.created`, `lead.assigned` | `['leads']`, `['followups']`, `['dashboard']` (5 s) | assigned to me: HOT red accent 8 s, others 5 s. Pool arrival: subtle, grouped when > 3 within 10 s. Reassigned away: info. Never when `event.by === me` |
| `lead.updated` | `['lead', id]`, `['leads']`, `['pipeline']` | none |
| `activity.created` | `['lead', leadId, 'activities']` | none |
| `followup.due` | `['followups']` | yes (assignee only) |
| `offer.changed` | `['offers']`, `['lead']` offers sub-keys | none |
| `resync` / reconnect | `invalidateQueries()` | none |

Highlight: `lead.created` / `lead.assigned` / `lead.updated` add `leadId` to the store for 5 s. The toaster shows at most 3.
Status: `open` → live, `error` while retrying → reconnecting, more than 60 s offline → offline plus 30 s polling.
Logged out: when reconnect fails, probe the session (`/api/auth/me`, F02). A 401 → `router.replace('/login')`.
