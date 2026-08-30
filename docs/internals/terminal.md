# Terminal

> For maintainers. Using Noyau? See [docs/users](../users/).

A Thread can host interactive shells in the workspace panel. The server owns
the PTY. Clients attach over RPC and render bytes locally. Opening a tab is
chrome only: no command or journal event records it.

## How it works

The client chooses `terminalId` (the workspace tab id) and calls
`terminal.attach` with `projectId` and `threadId`. The server resolves cwd from
the Thread worktree or the Project `WorkspaceRoot`, never from the client.
`TerminalPlane` reuses a live session or spawns via `PtyAdapter` (`node-pty`).
The first stream item is a snapshot (`history`, `pid`, `status`). Later items
are raw output, exit, clear, restart, or error.

Write, resize, clear, restart, and close are unary RPCs. Hide the panel: the
tab stays `keepMounted` and the PTY keeps running. Close the tab: the panel
calls `terminal.close`. Leave the Thread page: the UI detaches, the PTY stays
until the tab is closed or the server exits.

The web client paints with Ghostty (`libghostty-vt` WASM, revision in
[VERSION][7]). Attach snapshots call `resetAndWrite`; live `output` calls
`write`. Keys and paste are encoded in WASM and sent as `terminal.write`.
Resize comes from the canvas grid. Theme is read from `--foreground` and
`--background`. If WASM fails to load, the tab falls back to a focused `<pre>`
and the small key encoder in [terminal-key.ts][8]. Renderer state never
crosses the wire.

## Where it lives

| Piece | File |
| --- | --- |
| Contract | [terminal.ts][1] |
| RPC | [rpc.ts][2] |
| Sessions | [terminal-plane.ts][3] |
| PTY | [node-pty-adapter.ts][4] |
| Tab | [catalog.ts][5], [ThreadTerminal.tsx][6] |
| Ghostty | [surface.ts][9], [runtime.ts][10] |

## Related

- [Workspace panel](./workspace-panel.md)
- [Contracts and orchestration](./contracts-and-orchestration.md) — terminals
  stay off that path, like VCS status.

[1]: ../../packages/contracts/src/terminal.ts
[2]: ../../packages/contracts/src/rpc.ts
[3]: ../../apps/server/src/terminal/terminal-plane.ts
[4]: ../../apps/server/src/terminal/node-pty-adapter.ts
[5]: ../../apps/web/src/components/workspace-panel/catalog.ts
[6]: ../../apps/web/src/components/workspace-panel/ThreadTerminal.tsx
[7]: ../../apps/web/src/terminal/ghostty/vendor/VERSION
[8]: ../../apps/web/src/lib/terminal-key.ts
[9]: ../../apps/web/src/terminal/ghostty/surface.ts
[10]: ../../apps/web/src/terminal/ghostty/runtime.ts
