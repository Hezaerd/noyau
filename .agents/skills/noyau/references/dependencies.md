# Ticket dependencies

Interpret `A depends on B` as: A is blocked by B. Noyau's dependency graph is a DAG.

- Use returned Ticket IDs, never title matching, when changing a dependency.
- Do not add self-dependencies, duplicates, or cycles.
- Do not move Tickets merely to reflect a dependency.
- Consider a Ticket actionable only when every prerequisite is done.
- When asked to split work, create distinct Tickets and connect them with dependencies instead of
  embedding a checklist.

If a dependency mutation is rejected, list the relevant Tickets again. A rejection can mean the
graph changed since it was read; do not retry unchanged input blindly.
