# Write the glossary

Target: `docs/internals/glossary.md`.

`AGENTS.md` → *A small glossary* stays one line per term, no file paths. When a
sense changes, update both. Paths and nuance live only here.

This page is a dictionary for maintainers and agents. It is not an architecture
essay and not user documentation.

## Page shape

```markdown
# Glossary

> For maintainers. Using Noyau? See [docs/users](../users/).

This is a living glossary for Noyau. It explains what common terms mean in this
codebase.

## Table of contents

- [Project and workspace](#project-and-workspace)
- [Board](#board)
- [Thread timeline](#thread-timeline)
- [Domain](#domain)
- [Provider runtime](#provider-runtime)
- [Checkpointing](#checkpointing)

## Concepts

### Cluster name

Optional one-paragraph intro for the cluster. Then one `####` per term.

## Practical Shortcuts

- If you see `name`, think "short mnemonic".

## Related Docs

- [Sibling internals page][n]

[1]: ../../packages/contracts/src/entities/project.ts
```

Group by layer, not A–Z. A term belongs in one cluster. Add a cluster only when
several terms share a layer.

## One term

Two to four sentences:

1. What it is in the product.
2. Where it is typed (`packages/contracts/...`).
3. Where it is decided or projected (`apps/server/src/orchestration/...`), or which reactor
   performs the side effect.
4. A nuance only if the everyday word would lie.

```markdown
#### Ticket

A durable, flat unit of work on a project's board. It has no nested tickets,
checklists, or agent state. Shape is in [the ticket entity][n]; thread links
go through TicketThread. Commands land in [board/decider.ts][m]. The read
model is BoardSnapshot.
```

Use numbered footnotes for every file. Verify each target exists.

## What enters

A term enters only if Noyau gives it a type, command, event, or invariant.
Skip generic words (Git, WebSocket, folder).

Open the source. Do not guess names from memory. If a name is not in
`packages/contracts` or `apps/server/src/orchestration`, it is invented — drop it.

Useful starting points:

- `packages/contracts/src/entities/{project,ticket,thread,turn,session,environment}.ts`
- `packages/contracts/src/{board,receipts,turn-diff}.ts`
- `packages/contracts/src/entities/{ticket-thread,kanban-column,runtime-mode}.ts`
- `apps/server/src/orchestration/control-state.ts`
- `apps/server/src/orchestration/{project,board,thread}/{decider,projector}.ts`
- Reactors under `apps/server/src/` when the term is a side effect
  (provider, turn-diff, worktree, title).

## Meanings that are easy to get wrong

Write these from source, not from habit:

| Word | Noyau meaning | Open first |
|---|---|---|
| Receipt | Dispatch ack: `accepted` or `rejected` | `packages/contracts/src/receipts.ts` |
| TicketActivity | Bounded recent facts on a ticket, inside the board snapshot | `packages/contracts/src/board.ts` |
| Session | 0..1 provider-runtime projection on a thread; no separate business id | `packages/contracts/src/entities/session.ts` |
| Provider | Literal list on the environment entity | `packages/contracts/src/entities/environment.ts` |
| settle / unsettle | Thread turn cycle, not ticket complete | thread commands and events |
| done vs archived | Ticket finished vs removed from the active board | ticket entity + board decider |
| TicketThread | Optional many-to-many link; a ticket does not contain a thread | `packages/contracts/src/entities/ticket-thread.ts` |
| CheckpointRef | Hidden git ref `refs/noyau/checkpoint/<threadId>/<ordinal>` | `packages/contracts/src/entities/turn.ts` |

Project, board, and thread are separate aggregates, each with its own decider
and projector under `apps/server/src/orchestration`. The in-memory join is
`control-state.ts`.

## Practical Shortcuts

End the page with five to ten mnemonics derived from contract names. Examples
of the form, not a closed list:

- `done` → ticket finished, still on the board
- `archive` → left the active board, restorable
- `settle` / `unsettle` → turn quiet / turn live again
- `Receipt` → command ack, not an async milestone
- `checkpoint` → workspace snapshot for diff and restore

## Checklist

- [ ] Banner points at `docs/users/`.
- [ ] TOC matches the `###` clusters on the page.
- [ ] Every term has a contracts or orchestration pointer that exists.
- [ ] No type, command, or event name that source does not export.
- [ ] `AGENTS.md` one-liners still match the senses you changed.
- [ ] Related Docs links resolve to real pages, not stubs you did not write.
