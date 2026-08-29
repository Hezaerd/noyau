# Workspace panel

> For maintainers. Using Noyau? See [docs/users](../users/).

The Thread view hosts an optional right-hand chrome column. It is a tab strip of
surfaces, not a slot per tool. The store is client-only: no command, event, or
contract owns an open tab.

## How it works

A tab is `{ id, kind, payload }`. `id` is the instance. Opening a Terminal twice
creates two tabs with two ids. The kind is only how the tab is created and
rendered.

Kinds are registered in the web catalogue. Adding one is:

1. `defineWorkspaceTab` with `create` and `render`.
2. One entry in `workspaceTabCatalog`.

`create(tabId, input)` runs before the tab exists. There is no placeholder
surface. Launchable kinds use `openWorkspaceTab`; kinds that need input use
`openWorkspaceTabWith`. If a kind should reuse a tab (same file path), it sets
`identityOf`. Otherwise every open is a new id.

Closing the last tab leaves the panel open on the launcher. Hiding the panel
keeps the tab list. Kinds that set `keepMounted` stay in the DOM while inactive
so a later PTY or tree does not remount.

The Terminal kind is the first catalogue entry. Closing that tab calls
`terminal.close`. See [terminal](./terminal.md).

## Where it lives

| Piece | File |
| --- | --- |
| Transitions | [workspace-panel.ts][1] |
| Persistence | [workspace-panel-persist.ts][2] |
| Atom | [state/workspace-panel.ts][3] |
| Kind helper | [define-workspace-tab.ts][4] |
| Catalogue | [catalog.ts][5] |
| Dock | [WorkspacePanel.tsx][6] |

## Related

- [Contracts and orchestration](./contracts-and-orchestration.md) — this chrome
  does not cross that boundary.
- [Glossary](./glossary.md#workspace-panel)

[1]: ../../apps/web/src/lib/workspace-panel.ts
[2]: ../../apps/web/src/lib/workspace-panel-persist.ts
[3]: ../../apps/web/src/state/workspace-panel.ts
[4]: ../../apps/web/src/components/workspace-panel/define-workspace-tab.ts
[5]: ../../apps/web/src/components/workspace-panel/catalog.ts
[6]: ../../apps/web/src/components/workspace-panel/WorkspacePanel.tsx
