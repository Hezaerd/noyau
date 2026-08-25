---
name: noyau
description: Use Noyau's MCP tools to inspect and manage the current Project's Tableau, Tickets, dependencies, and links to the current Thread; or to ask the human structured questions via noyau_ask_question. Use when planning work from Noyau, choosing an actionable Ticket, updating Ticket lifecycle or relationships, reconciling completed agent work with the Noyau board, or running a grilling / decision round.
---

# Noyau

Treat Noyau as the durable source of truth for project work. Use only the `noyau_*` MCP tools
available in the current Turn; never edit Noyau's database or invent a missing tool.

## Core workflow

1. The latest user message on **this** Thread is the mandate. A resume token
   (« Reprends », « Resume ») does not replace it. Do not treat an En cours Ticket
   linked to another Thread as work to resume.
2. Inspect the Tableau before proposing or starting work.
3. Prefer an open actionable Ticket whose dependencies are complete **and** that is
   linked to this Thread, or that the latest user message named. Otherwise ask.
4. Preserve the identifiers returned by Noyau. Never infer IDs from titles.
5. Re-read affected Tickets after mutations when a read tool is available.
6. Report a missing Noyau capability instead of maintaining a parallel todo list.

The MCP capability is already scoped to the current Project and Thread. Do not ask for or pass a
different `projectId`, `threadId`, bearer token, or MCP endpoint.

## Route by intent

- Read, triage, or select work: read [references/board-reading.md](references/board-reading.md).
- Create, edit, move, complete, reopen, archive, or restore a Ticket: read
  [references/ticket-lifecycle.md](references/ticket-lifecycle.md).
- Inspect or change prerequisites: read
  [references/dependencies.md](references/dependencies.md).
- Associate work with the current conversation: read
  [references/thread-linking.md](references/thread-linking.md).
- Ask the human structured questions during a Turn: read
  [references/ask-question.md](references/ask-question.md).
- Handle unavailable tools, stale state, or rejected mutations: read
  [references/error-recovery.md](references/error-recovery.md).

Load only the references needed for the current request.
