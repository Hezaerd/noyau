# Glossary

> For maintainers. Using Noyau? See [docs/users](../users/).

This is a living glossary for Noyau. It explains what common terms mean in this codebase.

## Table of contents

- [Project and workspace](#project-and-workspace)
- [Boards](#boards)
- [Thread timeline](#thread-timeline)
- [Provider runtime](#provider-runtime)
- [Environment files](#environment-files)
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

#### Context usage

Last-known context usage for a Thread: the number of tokens used and the
model context-window size. Shape is [ContextUsage][14]. The internal
command is `thread.context-usage.set`; the event is `thread.context-usage-set`.
Adapters normalize native payloads and emit a `context-usage` signal. The
thread projector stores it on the Thread, not on the live Session, so the
fill survives session reap. Claude does not report it yet.

### Provider runtime

#### Environment

Durable local identity for this Noyau process: an id, a [providers](#provider-instance)
map, and a created time. Shape is [Environment][23]. It is not event-sourced.
Live updates travel as `environment-updated` on the shell stream. Enablement
and binary paths live in [`settings.json`](#settingsjson), not on this entity.

#### Provider

Thread and project bindings still say `provider`. That field is a
[provider instance](#provider-instance) id, not a driver kind. Historical
`cursor`, `claude`, and `codex` values keep decoding. Typed as
[Provider][24] (an alias of ProviderInstanceId).

#### Driver

Open branded slug that names an adapter implementation (`cursor`, `claude`,
`codex`, later a fork's `grok`). It picks the probe, protocol, and catalog.
Typed as [ProviderDriverKind][24]. Parsing must succeed for an unknown
driver; the runtime marks that instance unavailable instead of failing
decode.

#### Provider instance

A configured slot: instance id, driver, optional display name, enabled flag,
and an opaque config blob. Threads, sessions, model defaults, and the
Environment map route on the instance id. Defaults and the enablement rule
are in [settings.ts][25]. The live view the UI renders is
[ProviderInstanceView][23]. The mutable registry is
[provider-instance-registry.ts][26].

### Environment files

#### settings.json

Not event-sourced provider config under the [config directory][27]:
`~/.noyau/<channel>/settings.json` for a packaged app, or `NOYAU_HOME` /
the worktree `.noyau` when those are set. Schema and merge:
[settings.ts][25]. I/O: [provider-settings.ts][28]. See [settings][29].

#### keybindings.json

Sibling overlay array of `{ key, command, when? }`. Same directory as
`settings.json`. The server watches the file and publishes
`keybindings-updated` on the shell stream. Schema: [keybindings.ts][30].
I/O: [keybindings.ts][31]. See [settings][29].

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
[browser-tab.tsx][15], [BrowserView.tsx][16], and
[workspace-browser-session.ts][20].

#### PR tab

Workspace tab kind `pr`. It is the read-only GitHub pull request chrome in the
workspace panel: description, review timeline, file list, and diff. The open
tab is client-only; it fetches a live snapshot through `git.getPullRequest`.
Shape is in [git.ts][32]. Implementation: [pr-tab.tsx][33] and
[PullRequestView.tsx][34]. It is not event-sourced and it is not a
[browser tab](#browser-tab).

#### Preview guest

Electron `<webview>` that loads the committed preview URL inside the browser
tab. The host window does not navigate. Policy is [preview-manager.ts][21];
the tag is created only on the desktop runtime
([DesktopBrowserGuest.tsx][22]). `javascript:` and `file:` never load.

#### Preview session

Server-owned record of one in-app browser tab: `tabId`, thread, nav status, and
updated time. Shape is in [preview.ts][17]. The in-memory store is
[preview-sessions.ts][18]; clients reach it through `preview.open`,
`preview.navigate`, `preview.list`, and `preview.close`. It is not
event-sourced and it is not the client [browser tab](#browser-tab). See
[preview sessions][19].

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
[14]: ../../packages/contracts/src/entities/context-usage.ts
[15]: ../../apps/web/src/components/workspace-panel/browser-tab.tsx
[16]: ../../apps/web/src/components/workspace-panel/BrowserView.tsx
[17]: ../../packages/contracts/src/preview.ts
[18]: ../../apps/server/src/preview/preview-sessions.ts
[19]: ./preview-sessions.md
[20]: ../../apps/web/src/lib/workspace-browser-session.ts
[21]: ../../apps/desktop/src/preview/preview-manager.ts
[22]: ../../apps/web/src/components/workspace-panel/DesktopBrowserGuest.tsx
[23]: ../../packages/contracts/src/entities/environment.ts
[24]: ../../packages/contracts/src/entities/provider-instance.ts
[25]: ../../packages/contracts/src/settings.ts
[26]: ../../apps/server/src/provider/provider-instance-registry.ts
[27]: ../../packages/shared/src/dev-home.ts
[28]: ../../apps/server/src/provider/provider-settings.ts
[29]: ./settings.md
[30]: ../../packages/contracts/src/keybindings.ts
[31]: ../../apps/server/src/keybindings.ts
[32]: ../../packages/contracts/src/git.ts
[33]: ../../apps/web/src/components/workspace-panel/pr-tab.tsx
[34]: ../../apps/web/src/components/workspace-panel/PullRequestView.tsx
