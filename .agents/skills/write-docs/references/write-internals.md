# Write internals

Target tree: `docs/internals/`.

Voice: current system for maintainers and agents. Point at files. Do not
preserve abandoned intentions.

## What belongs

How a layer works today: workspace layout, providers, domain flow, persistence,
checkpointing, client/server boundary.

A page explains one concern. If the description says "also", split the page.

## What does not belong

- User-facing how-tos (those go in `docs/users/`).
- Plans, research, or "we should".
- A second glossary. New words go in `docs/internals/glossary.md`, then this
  page links the term.
- Empty scaffolds you cannot fill from source.

## Page shape

```markdown
# Concern name

> For maintainers. Using Noyau? See [docs/users](../users/).

One paragraph: what this layer is for.

## How it works

The moving parts and the invariant that matters.

## Where it lives

Footnotes to contracts, orchestration, and server files you opened.

## Related

- [Glossary](./glossary.md)
```

Prefer a few accurate file links over a tour of the monorepo. Wire types are
in `packages/contracts`. Decision and projection logic is in
`apps/server/src/orchestration/{project,board,thread}`. Side effects are
reactors in `apps/server`.

## Checklist

- [ ] Every file link opens a real path.
- [ ] Names match contracts and orchestration exports.
- [ ] The page describes current code, not a future cut.
- [ ] New vocabulary was added to the glossary or already existed there.
- [ ] Linked from `docs/README.md` under *Working on Noyau* when the page
      should be found.
