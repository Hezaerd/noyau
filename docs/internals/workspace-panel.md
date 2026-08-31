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

The first registered kind is `browser`: a launchable, `keepMounted` tab with
address chrome. Open it from the panel launcher, the command palette, or
`mod+shift+t`. The store keeps `{ url }` on the tab payload as a cache of the
last [preview session](./preview-sessions.md) snapshot. Mounting the surface
calls `preview.open`. Submitting the address bar calls `preview.navigate` and
writes the snapshot back. Closing the tab calls `preview.close`. On desktop the
body is a `<webview>` guest; hiding the panel keeps keepMounted surfaces
mounted so the guest does not reload. On the web client a submitted URL shows
that the in-app browser needs the desktop app.

`create(tabId, input)` runs before the tab exists. There is no placeholder
surface. Launchable kinds use `openWorkspaceTab`; kinds that need input use
`openWorkspaceTabWith`. If a kind should reuse a tab (same file path), it sets
`identityOf`. Otherwise every open is a new id.

Closing the last tab leaves the panel open on the launcher. Hiding the panel
keeps the tab list and, when tabs remain, the dock stays mounted (`hidden`) so
`keepMounted` guests do not reload. Kinds that set `keepMounted` stay in the
DOM while inactive so a later PTY or tree does not remount.

## Where it lives

| Piece | File |
| --- | --- |
| Transitions | [workspace-panel.ts][1] |
| Persistence | [workspace-panel-persist.ts][2] |
| Atom | [state/workspace-panel.ts][3] |
| Kind helper | [define-workspace-tab.ts][4] |
| Catalogue | [catalog.ts][5] |
| Dock | [WorkspacePanel.tsx][6] |
| Browser kind | [browser-tab.tsx][7] |
| Browser chrome | [BrowserView.tsx][8] |
| Open browser | [WorkspaceBrowserOpen.tsx][9] |
| Preview binding | [workspace-browser-session.ts][10] |
| Desktop guest | [DesktopBrowserGuest.tsx][11] |

## Related

- [Preview sessions](./preview-sessions.md) — server-owned tab record the chrome
  binds on mount / navigate / close
- [Contracts and orchestration](./contracts-and-orchestration.md) — this chrome
  does not cross that boundary.
- [Glossary](./glossary.md#workspace-panel)

[1]: ../../apps/web/src/lib/workspace-panel.ts
[2]: ../../apps/web/src/lib/workspace-panel-persist.ts
[3]: ../../apps/web/src/state/workspace-panel.ts
[4]: ../../apps/web/src/components/workspace-panel/define-workspace-tab.ts
[5]: ../../apps/web/src/components/workspace-panel/catalog.ts
[6]: ../../apps/web/src/components/workspace-panel/WorkspacePanel.tsx
[7]: ../../apps/web/src/components/workspace-panel/browser-tab.tsx
[8]: ../../apps/web/src/components/workspace-panel/BrowserView.tsx
[9]: ../../apps/web/src/components/workspace-panel/WorkspaceBrowserOpen.tsx
[10]: ../../apps/web/src/lib/workspace-browser-session.ts
[11]: ../../apps/web/src/components/workspace-panel/DesktopBrowserGuest.tsx
