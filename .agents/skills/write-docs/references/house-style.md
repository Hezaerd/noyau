# House style

## Trees

| Audience | Path | Voice |
|---|---|---|
| User | `docs/users/` | Shipped product. What the user sees and does. |
| Maintainer | `docs/internals/` | Current system, with file links. |
| Vocabulary | `docs/internals/glossary.md` | Terms that have a Noyau meaning. |
| Runbook | `docs/operations/` | Steps a human runs today. |

`AGENTS.md` keeps a one-line glossary for communication. File-linked definitions
belong only in `docs/internals/glossary.md`.

Index new pages from `docs/README.md` when they are meant to be found.

## Language

Write `docs/users/`, `docs/internals/`, `docs/operations/`, and the glossary in
English. Match `AGENTS.md` terminology (user, agent, provider, client,
environment, project, thread, turn, board, ticket, Noyau home).

Do not switch a page's language mid-file, everything should be in English.

## Facts

A sentence is allowed only if you can point at Noyau source or a Noyau doc that
already states it.

Open, in this order:

1. `packages/contracts` — entities, commands, events, receipts, ids.
2. `apps/server/src/orchestration/{project,board,thread}` — deciders and projectors.
3. `apps/server` — reactors, persistence, providers, git, only when the page
   needs that side effect.

If the source and an old doc disagree, the source wins. Fix the doc. Do not
document a name that does not exist in contracts or orchestration.

## Prose

- Short sentences. One idea per paragraph.
- Name the thing, then where it lives. No preamble.
- Present tense. "A ticket is…", not "A ticket will be…".
- Do not narrate the refactor. Describe the system as it is.
- Do not mention other products, forks, or comparison baselines.
- Comments in source stay next to the code. Docs explain how a thing is used.

## Links

- Internals and glossary: numbered footnotes at the bottom (`[1]: path`).
- User docs: no `packages/`, `apps/`, `vp`, or worktree paths.
- Relative links that resolve. If the target file is empty or missing, do not
  link it; say so or skip the pointer.

## Out of scope

- Implementation plans, research dumps, agent scratch.
- Duplicating `AGENTS.md` policy.
- Expanding product scope in docs that the code does not have.
