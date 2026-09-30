# Contract: Event Bus — LeadDeskEvent

**Phase 1 output** | Module: `packages/shared/src/events.ts` + `apps/web/server/events/bus.ts`

All real-time events in the system travel over this contract. The event bus publishes to
Redis channel `leaddesk:events` when connected; it falls back to in-process delivery when
Redis is in degraded mode. Consumers that care about cross-process delivery (SSE, live
inbox) depend on Redis being available.

---

## Channel

```ts
export const EVENTS_CHANNEL = 'leaddesk:events';
```

---

## Base Fields (present on every event)

```ts
type Base = {
  at:      number;           // unix ms; when the event occurred
  teamId:  string;           // team the lead belongs to
  ownerId: string | null;    // current owner (null = unassigned or system event)
  by:      string | null;    // actor user id (null = system/intake)
};
```

---

## Event Union (`LeadDeskEvent`)

```ts
export type LeadDeskEvent =
  | (Base & {
      type: 'lead.created';
      lead: LeadSummary;       // full inbox-row DTO
    })
  | (Base & {
      type: 'lead.assigned';
      leadId:      string;
      fromOwnerId: string | null;
      toOwnerId:   string | null;
      method:      'AUTO' | 'MANUAL' | 'CLAIM';
    })
  | (Base & {
      type:    'lead.updated';
      leadId:  string;
      changes: Partial<LeadSummary>;   // only changed fields
    })
  | (Base & {
      type:     'activity.created';
      leadId:   string;
      activity: ActivityDTO;
    })
  | (Base & {
      type:        'followup.due';
      followUpId:  string;
      leadId:      string;
      dueAt:       number;
    })
  | (Omit<Base, 'ownerId' | 'teamId'> & {
      type:    'offer.changed';
      offerId: string;
      teamId:  null;
      ownerId: null;
    });
```

---

## Supporting DTOs

```ts
// LeadSummary — the inbox row shape sent in lead.created and lead.updated events
type LeadSummary = {
  id:              string;
  reference:       string;
  customerName:    string;     // first_name + ' ' + last_name
  vehicleModel:    string | null;
  source:          LeadSource;
  stage:           Stage;
  priority:        Priority;
  score:           number;
  ownerId:         string | null;
  ownerName:       string | null;
  teamId:          string;
  createdAt:       number;
  lastActivityAt:  number | null;
  nextFollowUpAt:  number | null;
  isReturning:     boolean;
  slaStatus:       'ok' | 'breached' | null;
};

// ActivityDTO — sent in activity.created events
type ActivityDTO = {
  id:          string;
  leadId:      string;
  actorId:     string | null;
  actorName:   string | null;
  kind:        ActivityKind;
  type:        ActivityType;
  outcome:     Outcome | null;
  note:        string;
  aiAssisted:  boolean;
  metadata:    Record<string, unknown> | null;
  createdAt:   number;
};
```

---

## SSE Delivery Filter

Events are filtered per SSE subscriber based on the user's scope:

- Deliver when `ownerId ∈ scope(user)` — the event involves a lead the user can see
- OR when `ownerId = null` AND `teamId ∈ teams(scope)` — unassigned lead in user's teams
- `offer.changed` is delivered to all connected users (no scope filter)

---

## EventBus Interface (`apps/web/server/events/bus.ts`)

```ts
export interface EventBus {
  publish(e: LeadDeskEvent): Promise<void>;           // never throws; logs failures
  subscribe(handler: (e: LeadDeskEvent) => void): () => void;  // returns unsubscribe fn
  mode(): 'redis' | 'memory';
}

export const bus: EventBus;
```

**Guarantees**:
- `publish` never throws. Connection errors are caught and logged.
- Local subscribers (same process) receive every event exactly once, regardless of mode.
- In `'redis'` mode, subscribers in other processes (e.g. separate Next.js workers) also
  receive the event via the dedicated subscriber connection.
- De-duplication ensures a local subscriber doesn't receive an event twice when both local
  delivery and Redis delivery are active.
