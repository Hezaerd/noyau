# Ticket lifecycle

Discover the available `noyau_*` tools and follow their schemas.

- Create with `noyau_ticket_create` only for a distinct durable unit of work. Do not create
  checklists or synthetic progress Tickets. Put acceptance detail in the description via
  `noyau_ticket_update`.
- Keep titles concise.
- Claim work by linking the current Thread (`noyau_ticket_thread_link`) and moving the Ticket into
  the active column (`noyau_ticket_move`), not by inventing a parallel todo list.
- Prefer `noyau_ticket_complete` / `noyau_ticket_reopen` over a raw move when that is the intent.
  Moving into `Done` completes a Ticket; moving out reopens it.
- Archive with `noyau_ticket_archive` only for work that should leave the active Board; restore
  with `noyau_ticket_restore` instead of recreating it.
- Pass a stable `operationId` (UUID) on mutations you may retry.
- Never duplicate a Ticket merely because a mutation tool is unavailable.

Before completing work, inspect its dependencies. If Noyau requires confirmation because a
prerequisite remains open, explain the inconsistency and ask the user before confirming with
`acknowledgeOpenDependencies=true`.

After a successful mutation, re-read the affected state with `noyau_ticket_get` or
`noyau_ticket_list` and report the durable result, not merely the attempted action.
