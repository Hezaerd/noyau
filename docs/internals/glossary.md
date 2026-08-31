# Glossary

> For maintainers. Using Noyau? See [docs/users](../users/).

This is a living glossary for Noyau. It explains what common terms mean in this codebase.

## Table of contents

- [Project and workspace](#project-and-workspace)
- [Boards](#boards)
- [Thread timeline](#thread-timeline)
- [Client chrome](#client-chrome)
- [Orchestration](#orchestration)

## Concepts

### Project and workspace

#### Project

...

#### Workspace root

...

#### Worktree

...

### Boards

#### Board

...

#### Column

...

#### Ticket

...

### Thread timeline

### Client chrome

#### Workspace panel

Optional right-hand column on a Thread page. It is a tab strip of tool surfaces,
not a slot per tool. The store is client-only: no command, event, or contract
owns an open tab. Implementation: [workspace-panel.ts][11] and
[WorkspacePanel.tsx][12]. See [workspace panel][13].

#### Workspace tab

One instance in the workspace panel. Identity is `id`, not `kind`. Opening the
same kind twice creates two tabs unless the kind sets `identityOf`. There is no
placeholder tab: `create` produces the payload before the tab exists.

#### Browser tab

Workspace tab kind `browser`. It is the in-app browser chrome in the workspace
panel: address bar, empty state, and the desktop [preview guest](#preview-guest).
The open tab is client-only; it binds a server-owned
[preview session](#preview-session) for the committed URL. Implementation:
[browser-tab.tsx][14], [BrowserView.tsx][15], and
[workspace-browser-session.ts][19].

#### Preview guest

Electron `<webview>` that loads the committed preview URL inside the browser
tab. The host window does not navigate. Policy is [preview-manager.ts][20];
the tag is created only on the desktop runtime
([DesktopBrowserGuest.tsx][21]). `javascript:` and `file:` never load.

#### Preview session

Server-owned record of one in-app browser tab: `tabId`, thread, nav status, and
updated time. Shape is in [preview.ts][16]. The in-memory store is
[preview-sessions.ts][17]; clients reach it through `preview.open`,
`preview.navigate`, `preview.list`, and `preview.close`. It is not
event-sourced and it is not the client [browser tab](#browser-tab). See
[preview sessions][18].

### Orchestration

Wire types live in contracts. Decision and projection live on the server.
See [contracts and orchestration][1].

#### Contract

Effect/Schema for ids, commands, events, receipts, and RPC, plus small helpers
such as thread title sanitizing. The package is [packages/contracts][2]. It
does not export `decide`, `evolve`, or `recoverAfterBoot`.

#### Decider

Pure function that turns a command plus current aggregate state into events or
a rejection. One file per aggregate: [project][3], [board][4], [thread][5].

#### Projector

Pure `evolve` that folds events into the in-memory aggregate used by the next
decide. Same three folders: [project][6], [board][7], [thread][8].

#### Control state

The in-memory join of the three aggregate projections used by the next decide.
The journal is keyed `{ kind: "project", id: projectId }`, so project, board,
and thread replay as one blob. [control-state.ts][10] owns `decide`, `evolve`,
and `recoverControlStateAfterBoot`. `project.create` is the only command that
runs two deciders: project, then `board.initialize`.

#### Recovery

`recoverAfterBoot` marks Sessions that cannot still own a process after restart
as `error`. It does no provider I/O. Implementation: [thread/recovery.ts][9].
The control-state recover wrapper applies those events to the thread projection
only.

[1]: ./contracts-and-orchestration.md
[2]: ../../packages/contracts/package.json
[3]: ../../apps/server/src/orchestration/project/decider.ts
[4]: ../../apps/server/src/orchestration/board/decider.ts
[5]: ../../apps/server/src/orchestration/thread/decider.ts
[6]: ../../apps/server/src/orchestration/project/projector.ts
[7]: ../../apps/server/src/orchestration/board/projector.ts
[8]: ../../apps/server/src/orchestration/thread/projector.ts
[9]: ../../apps/server/src/orchestration/thread/recovery.ts
[10]: ../../apps/server/src/orchestration/control-state.ts
[11]: ../../apps/web/src/lib/workspace-panel.ts
[12]: ../../apps/web/src/components/workspace-panel/WorkspacePanel.tsx
[13]: ./workspace-panel.md
[14]: ../../apps/web/src/components/workspace-panel/browser-tab.tsx
[15]: ../../apps/web/src/components/workspace-panel/BrowserView.tsx
[16]: ../../packages/contracts/src/preview.ts
[17]: ../../apps/server/src/preview/preview-sessions.ts
[18]: ./preview-sessions.md
[19]: ../../apps/web/src/lib/workspace-browser-session.ts
[20]: ../../apps/desktop/src/preview/preview-manager.ts
[21]: ../../apps/web/src/components/workspace-panel/DesktopBrowserGuest.tsx
