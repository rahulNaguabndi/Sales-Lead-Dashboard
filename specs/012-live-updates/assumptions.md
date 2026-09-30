# F12 Assumptions

| Question | Answer | Source |
|---|---|---|
| Does a rep receive events for teammates' leads? | No: self + own team pool only | inferred from FR-006 and docs/03 §5 |
| Dashboard real-time or debounced? | Debounced 5 s | F12 §11 |
| HOT-lead notification sound? | Optional polish, off by default with toggle | F12 §11 |
| Maximum visible toasts? | 3 | F12 §7 |
| Event for a lead that left the user's scope? | Row disappears on refresh, detail shows reassignment banner | F12 US-3.2 |
| Hard dependencies F04/F10 not yet on this branch (specs absent)? | Spec/plan written against the interfaces in their docs. Implementation must stub `live-slot.ts` and the bus until they merge | build-feature step 0 |
| `followup.due` has no assignee field in the F01 event. Who receives it? | The event `ownerId` is treated as the assignee. The filter delivers only to that user | inferred from F01 contracts/events.md |
| `lead.assigned` events carry no lead summary, yet US-1 toast text needs one | Use the summary from a matching `lead.created`, else generic text. F10/F11 are asked to publish a summary (follow-up) | analyze finding, research D7 |
| Logout detection on reconnect needs a session probe | Use F02's session endpoint (`/api/auth/me`), and if absent treat repeated failed reconnects as Offline | inferred |
