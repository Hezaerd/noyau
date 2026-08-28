# Glossary

> For maintainers. Using Noyau? See [docs/users](../users/).

This is a living glossary for Noyau. It explains what common terms mean in this codebase.

## Table of contents

- [Project and workspace](#project-and-workspace)
- [Boards](#boards)
- [Thread timeline](#thread-timeline)
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

#### Recovery

`recoverAfterBoot` marks Sessions that cannot still own a process after restart
as `error`. It does no provider I/O. Implementation: [thread/recovery.ts][9].

[1]: ./contracts-and-orchestration.md
[2]: ../../packages/contracts/package.json
[3]: ../../apps/server/src/orchestration/project/decider.ts
[4]: ../../apps/server/src/orchestration/board/decider.ts
[5]: ../../apps/server/src/orchestration/thread/decider.ts
[6]: ../../apps/server/src/orchestration/project/projector.ts
[7]: ../../apps/server/src/orchestration/board/projector.ts
[8]: ../../apps/server/src/orchestration/thread/projector.ts
[9]: ../../apps/server/src/orchestration/thread/recovery.ts
