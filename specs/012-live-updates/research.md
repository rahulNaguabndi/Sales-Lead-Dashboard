# Research: F12 Live Updates

| # | Decision | Rationale | Alternatives |
|---|---|---|---|
| D1 | SSE via a `ReadableStream` in a Node-runtime route handler | One-way push, native reconnect, works in Next route handlers (ADR 004) | WebSocket, polling |
| D2 | The hub subscribes once via `bus.subscribe`, guarded by `globalThis.__ldHub` | Survives dev hot reload with no duplicate subscribers. The bus already handles Redis vs in-process | Own ioredis subscriber (duplicates F01's degradation logic) |
| D3 | Event id = `ulid()` assigned by the hub at ingestion | The F01 event has no id. Each process assigns ids to its own ring buffer, and `Last-Event-ID` is best-effort per process, so an unknown id means `resync` | Put ids into the event schema (owned by F01) |
| D4 | Scope = `{ userIds:Set, teamIds:Set, isVP }` from F03 `scopeFor(user)`, refreshed every 60 s and on team-changing `lead.assigned` | FR-007. A refresh failure keeps the old scope, but a missing or revoked user closes the stream | Recompute per event (too costly) |
| D5 | Client store with `useSyncExternalStore` | No new dependency (Constitution VIII) | Zustand (extra dep), React context (re-render cost) |
| D6 | Event shape follows F01 `contracts/events.md` (flat fields such as `leadId`, `fromOwnerId`, and `lead` for created). F12 §9's `payload.summary` wire example is illustrative. Wire `data` is the F01 event JSON | F01 owns the contract | Change F01's schema |
| D7 | The `lead.assigned` toast needs name, priority and model, but F01's `lead.assigned` carries no summary. The toast uses a `summary` if the payload has one, otherwise a generic "Lead assigned to you" with an Open action. Logged as a follow-up for F10/F11 to include a summary | No F01 schema change | Fetch the lead on each event (extra request and auth) |
| D8 | Invalidation debounce: per query key 250 ms, dashboard 5 s (FR-011, Edge Cases) | Bursts of 100 leads | none |
| D9 | Offline polling: after > 60 s Offline, `refetchInterval` 30 s via a store flag consumed by a `useLivePollingInterval()` helper | FR-018 | none |
| D10 | Per-user limit of 5: the hub closes the oldest connection | FR-014 | reject the new one |
