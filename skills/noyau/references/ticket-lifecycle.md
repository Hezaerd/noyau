# Ticket lifecycle

Discover the available `noyau_*` tools and follow their schemas. The installed Noyau version may
expose only a subset of lifecycle mutations.

- Create a Ticket only for a distinct durable unit of work. Do not create checklists or synthetic
  progress Tickets.
- Keep titles concise and put acceptance detail in the description.
- Moving into `Done` completes a Ticket; moving out reopens it.
- Prefer the dedicated complete or reopen tool when one is available.
- Archive only work that should leave the active Tableau; restore instead of recreating it.
- Never duplicate a Ticket merely because a mutation tool is unavailable.

Before completing work, inspect its dependencies. If Noyau requires confirmation because a
prerequisite remains open, explain the inconsistency and ask the user before confirming.

After a successful mutation, re-read the affected state when possible and report the durable
result, not merely the attempted action.
