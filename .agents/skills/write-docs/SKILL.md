---
name: write-docs
description: >-
  Write or update Noyau documentation in docs/users, docs/internals,
  docs/operations, or docs/internals/glossary.md. Use when creating, rewriting,
  or reviewing user docs, internals, glossary entries, architecture notes, or
  runbooks.
---

# Write docs

This skill teaches how to write Noyau docs. Product facts live in Noyau source
and in `docs/`. Do not invent types, command names, or vocabulary.

## Workflow

1. Read [references/house-style.md](references/house-style.md).
2. Pick the audience and load **one** genre reference.
3. Open the Noyau source that owns the fact (`packages/contracts`,
   then `apps/server/src/orchestration` for decide / evolve / recover,
   then other `apps/server` files if the behavior is a reactor or
   persistence detail).
4. Write or update only the target page. Do not expand scope to nearby docs
   unless a link would otherwise lie.

## Route by audience

- User-visible behavior (shipped product): read
  [references/write-user.md](references/write-user.md).
- Architecture or contributor explanation: read
  [references/write-internals.md](references/write-internals.md).
- New or changed vocabulary: read
  [references/write-glossary.md](references/write-glossary.md).
- Runbook a human executes: follow house-style, put the page in
  `docs/operations/`, numbered steps, current commands only.

Load only the references needed for the current request.

Do not write ADRs, research notes, or design drafts unless the maintainer asked
for that file. Do not put writing recipes in `AGENTS.md`.
