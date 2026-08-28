# Write user docs

Target tree: `docs/users/`.

Voice: shipped product. The reader is a person directing agents in Noyau. They
do not have the repo open.

## What belongs

A behavior the user can see or do: install, providers, permissions, keyboard
shortcuts, board and tickets, threads, settings, updates.

Write what happens in the UI, what to click or type, what success looks like,
and how to undo it. If you added a way in, document the way out.

## What does not belong

- `packages/`, `apps/`, `vp`, worktrees, test receipts, deciders, projectors.
- Command or event type names (`ticket.complete`, `ThreadTurnStarted`).
- Contributor policy, CI, or how to run the server from source (root README
  and `docs/internals/`).
- Roadmap and unimplemented surfaces. If the code cannot do it, the page
  does not promise it.

## Page shape

```markdown
# Short task-oriented title

One sentence: what this page helps the user do.

## Do the thing

Numbered steps in the UI.

## Reverse or recover

How to undo, disable, or get back.
```

Link sibling user pages, not internals. If a term needs a definition, use
plain language on the page. Do not send users to the glossary.

## Checklist

- [ ] A user who never cloned the repo can follow the page.
- [ ] No source paths, package names, or maintainer tooling.
- [ ] Providers listed match `packages/protocol` (check, then write the
      product names only).
- [ ] Reverse action is documented when the feature has one.
- [ ] Linked from `docs/README.md` under *Using Noyau*.
