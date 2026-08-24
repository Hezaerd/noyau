# Linking Tickets and the current Thread

A Ticket and a Thread have an optional many-to-many relationship. Linking records that the
conversation contributes to the Ticket; it does not claim, assign, start, or complete the Ticket.

- Use `noyau_ticket_thread_link` / `noyau_ticket_thread_unlink` (scoped to the current Thread).
- Prefer linking before substantial work when the target Ticket is known.
- Keep a link while the transcript remains relevant, even after completion.
- Unlink only when the relationship is incorrect, not merely because the Turn ended.
- Do not create a dedicated Thread per Ticket unless the user explicitly wants one.

Use `linkedToCurrentThread` from `noyau_ticket_list` to avoid duplicate link attempts.
