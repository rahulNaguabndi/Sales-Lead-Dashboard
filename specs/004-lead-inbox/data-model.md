# Data Model: F04 (read-only)

No schema changes. Reads: `leads`, `customers` (`is_returning`, `search_text`, city, country, names), `users` (owner name/avatar), `follow_ups` (MIN(due_at) WHERE status='PENDING'), `activities` (latest USER activity; EXISTS contact activity: kind='USER' AND type<>'NOTE').

## Computed fields (query time)
- `next_follow_up_at` = MIN(follow_ups.due_at) WHERE PENDING
- `overdue` = next_follow_up_at < now
- `has_contact_activity` = EXISTS(USER, type<>'NOTE')
- `sla_breach` = stage='NEW' AND NOT has_contact_activity AND now − created_at > (priority='HOT' ? 15 min : 2 h)
- `going_cold` = stage IN (NEW…NEGOTIATION) AND coalesce(last_contact_at, created_at) ≤ now − 3 d
- `latest_user_activity` = newest activity with kind='USER'

## Indexes relied on
`leads(owner_id, stage)`, `leads(team_id, owner_id)`, `leads(created_at)`, `leads(last_activity_at)`, `leads(stage, last_contact_at)`, `leads(priority, score)`, `follow_ups(assigned_to, status, due_at)`, `activities(lead_id, created_at)`, `customers(search_text)`.
