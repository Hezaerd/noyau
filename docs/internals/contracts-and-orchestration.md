# Contracts and orchestration

> For maintainers. Using Noyau? See [docs/users](../users/).

Wire types and decision logic are separate. Schemas stay in one package so the
client, the journal, and the server decode the same shapes. `decide`, `evolve`,
and `recoverAfterBoot` run only on the server.

## How it works

| Layer | Where | What |
| --- | --- | --- |
| Contracts | `packages/contracts` | Effect/Schema plus small derived helpers. No `decide` / `evolve` / `recover`. |
| Orchestration | `apps/server/src/orchestration/` | Three aggregates: project, thread, and board. Each has a decider and a projector. Thread also has boot recovery. |

Commands, events, `EventEnvelope`, internal thread commands, and receipts stay
in contracts. The renderer decodes them on `subscribe*` and catch-up. The
journal persists them. They are not server-only types.

`sanitizeThreadTitle` and `canReplaceThreadTitle` stay in contracts because
web and the thread projector both import them.

Project, board, and thread stay three aggregates. `control-plane.ts` dispatches
the three deciders; it is not folded into a single engine.

## Where it lives

- Package rule: [packages/contracts/package.json][1]
- Board: [board/decider.ts][2], [board/projector.ts][3]
- Project: [project/decider.ts][4], [project/projector.ts][5]
- Thread: [thread/decider.ts][6], [thread/projector.ts][7], [thread/recovery.ts][8]
- Title helpers: [thread/title.ts][9]
- Envelope: [events.ts][10]

## Related

- [Glossary](./glossary.md)

[1]: ../../packages/contracts/package.json
[2]: ../../apps/server/src/orchestration/board/decider.ts
[3]: ../../apps/server/src/orchestration/board/projector.ts
[4]: ../../apps/server/src/orchestration/project/decider.ts
[5]: ../../apps/server/src/orchestration/project/projector.ts
[6]: ../../apps/server/src/orchestration/thread/decider.ts
[7]: ../../apps/server/src/orchestration/thread/projector.ts
[8]: ../../apps/server/src/orchestration/thread/recovery.ts
[9]: ../../packages/contracts/src/thread/title.ts
[10]: ../../packages/contracts/src/events.ts
