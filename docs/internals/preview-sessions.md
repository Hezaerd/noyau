# Preview sessions

> For maintainers. Using Noyau? See [docs/users](../users/).

A preview session is the server-owned record of one in-app browser tab: which
thread it belongs to, the committed URL, and a nav status. It is not a client
[browser tab](./glossary.md#browser-tab) and it is not event-sourced.

## How it works

`PreviewSessions` keeps an in-memory map of thread → `{ sessions, activeTabId }`.
Restart wipes it. The service does not check that the thread exists in the
journal.

Clients talk to it through four RPCs: `preview.open`, `preview.navigate`,
`preview.list`, `preview.close`. Open without a URL is `Idle`. Open or navigate
with a URL runs `normalizePreviewUrl`; a page URL becomes `Success` with a
hostname title immediately (there is no guest load yet). `javascript:` and
`file:` fail as `PreviewUrlInvalid`. Unknown tab ids fail as
`PreviewTabNotFound`. List on an unknown thread is empty, not an error. Close
is the way out: if the closed tab was active, a neighbor becomes active.

`Loading` and `LoadFailed` exist on the contract. The service does not emit
them; the desktop guest shows a local failure overlay instead.

The workspace-panel browser chrome binds a session when the surface mounts
(`preview.open`) and submits the address bar through `preview.navigate`. The
client tab payload `{ url }` is a cache of the last snapshot, used for the tab
title and persistence. A full reload drops the in-memory binding and opens a
new session from that cached URL. Closing a tab calls `preview.close`. Hiding
the panel does not: keepMounted surfaces stay in the DOM so the guest does not
reload.

On the desktop runtime the guest is an Electron `<webview>` in partition
`noyau-preview`. The host window gates attachment (`will-attach-webview`):
only that partition, only an http(s) `src`, and no guest preload.
[preview-manager.ts][8] then attaches every webview: http(s) only on
`will-navigate` and `will-redirect`, permissions denied, `target=_blank` opens
in the system browser. In-guest navigations (links, back, forward) call
`preview.navigate` so the committed URL stays the snapshot. The web client
still shows that the in-app browser needs the desktop app.

## Where it lives

| Piece | File |
| --- | --- |
| Wire types | [preview.ts][1] |
| RPCs | [rpc.ts][2] |
| URL rules | [preview-url.ts][3] |
| Store | [preview-sessions.ts][4] |
| Handlers | [rpc-handlers.ts][5] |
| Client binding | [workspace-browser-session.ts][6] |
| Guest policy | [preview-guest-policy.ts][7] |
| Preview manager | [preview-manager.ts][8] |
| Guest chrome | [DesktopBrowserGuest.tsx][9] |

## Related

- [Workspace panel](./workspace-panel.md) — client chrome that binds these RPCs
- [Glossary](./glossary.md#preview-session)

[1]: ../../packages/contracts/src/preview.ts
[2]: ../../packages/contracts/src/rpc.ts
[3]: ../../packages/shared/src/preview-url.ts
[4]: ../../apps/server/src/preview/preview-sessions.ts
[5]: ../../apps/server/src/rpc-handlers.ts
[6]: ../../apps/web/src/lib/workspace-browser-session.ts
[7]: ../../apps/desktop/src/preview/preview-guest-policy.ts
[8]: ../../apps/desktop/src/preview/preview-manager.ts
[9]: ../../apps/web/src/components/workspace-panel/DesktopBrowserGuest.tsx
