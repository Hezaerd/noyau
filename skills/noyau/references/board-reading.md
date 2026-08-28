# Reading and triaging the Board

Call `noyau_ticket_list` before selecting work. The result includes `columns` so you can
target moves and creates by `columnId`.

- Omit filters or use `state: "open"` for active work.
- Use `actionability: "actionable"` when choosing work to start.
- Use `actionability: "blocked"` to diagnose unfinished prerequisites.
- Use `state: "all"` only when completed Tickets matter to the request.
- Use `noyau_ticket_get` when you need one Ticket after a mutation.

Use `actionable`, `blockedBy`, priority, due date, column, and
`linkedToCurrentThread` together. Do not treat visual order alone as authorization to start a
blocked Ticket. `linkedToCurrentThread: false` on an In progress Ticket means another Thread owns
that work — do not pick it as a resume of the current conversation. If several Tickets are equally
suitable, summarize the trade-off and ask the user instead of silently choosing based on title.

Retain `snapshotSequence` as evidence of when the view was read. If a later mutation reports stale
state or a conflict, list again before retrying.
