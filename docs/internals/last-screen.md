# Last screen restore

> For maintainers. Using Noyau? See [Open where you left off](../users/startup.md).

The client remembers the last Board, Thread, or new Thread and restores it on
`/` after the boot splash. It is renderer-local. The server does not own this
record.

## How it works

`lastScreenFromPathname` writes a Board, Thread, or new Thread whenever the
route is one of those product surfaces. Settings and `/` do not write.
`/thread/new` stores `{ _tag: "new-thread", projectId }`.

On `/`, Home waits for the shell snapshot, then
`resolveStartupDestination` picks Board, Thread, new Thread, or Home. The boot
splash stays up until that navigation lands, or until Home is the real
destination, so the empty home does not flash.

A remembered Thread that is missing, or that now belongs to another Project,
falls back to that Project's Board. A remembered Project that is gone clears
the record. The catalog's first Project is never chosen as a substitute.

`selectProject` keeps the current Thread or new Thread when the Project does
not change, so a sidebar click on the already-open Thread does not downgrade
the record to the Board. Switching Project stores that Project's Board until
the next route write.

A leftover `noyau.last-project-id` value is read once as that Project's Board.
The next write stores `noyau:last-screen` and removes the old key.

## Where it lives

- Persist and resolve: [last-screen.ts][1]
- Last-screen atom and `selectProject`: [shell.ts][2]
- Route recorder: [use-last-screen-recorder.ts][3]
- Home restore: [HomePage.tsx][4]
- Splash hold: [control-plane-context.tsx][5]

## Related

- [Settings and keybindings files](./settings.md)
- [Glossary](./glossary.md)

[1]: ../../apps/web/src/lib/last-screen.ts
[2]: ../../apps/web/src/state/shell.ts
[3]: ../../apps/web/src/hooks/use-last-screen-recorder.ts
[4]: ../../apps/web/src/pages/HomePage.tsx
[5]: ../../apps/web/src/components/control-plane-context.tsx
