# Settings and keybindings files

> For maintainers. Using Noyau? See [Change a keyboard shortcut](../users/keybindings.md) and
> [Turn a provider on or off](../users/providers.md).

Environment configuration lives in two pretty-printed JSON files. They are not
event-sourced. The server owns them, watches them, and pushes live updates on
the shell stream.

## How it works

Packaged apps keep the files at `~/.noyau/<channel>/settings.json` and
`~/.noyau/<channel>/keybindings.json` (`development` → `dev`). Sqlite and
attachments stay in `dataDirectory`. When `NOYAU_HOME` or `NOYAU_DATA_DIR` is
set — including a worktree `.noyau` — both files live in that directory.

`settings.json` is still `{ providerInstances }`. A missing file hydrates the
three built-in providers. If the packaged config path has no file yet, the
server copies a legacy `settings.json` out of `dataDirectory`.

`keybindings.json` is a JSON array of `{ key, command, when? }` overlay rules.
Empty means the built-in map. The server stores shape-valid rules (max 256).
The client drops unknown commands and invalid shortcuts when it compiles.

Writes are `tmp` + rename. A directory watch ignores `.tmp` and debounces.
The server keeps the last good overlay in memory: invalid JSON logs a warning
and does not publish. A UI patch and a hand-edit are the same document.

`server.getSettings` / `server.patchSettings` and `server.getKeybindings` /
`server.replaceKeybindings` are the RPCs. A settings patch still rebuilds the
provider registry and publishes `environment-updated`. A keybindings write or
file change publishes `keybindings-updated`. Those two tags are side channels
on the shell stream: they apply after the snapshot without moving the journal
cursor.

The first shell snapshot hydrates the client overlay. An empty server file plus
a leftover `noyau:keybindings` localStorage value migrates once, then the
storage key is cleared.

`bun run dev` in a linked worktree copies missing `settings.json` and
`keybindings.json` into `<worktree>/.noyau` from `~/.noyau/<channel>/`, then
`~/.noyau/userdata`, nightly, and latest. Existing files win. `--home-dir`
skips the copy.

## Where it lives

- Path helpers: [dev-home.ts][1]
- Settings schema: [settings.ts][2]
- Keybindings schema: [keybindings.ts][3]
- Settings I/O: [provider-settings.ts][4]
- Keybindings I/O: [keybindings.ts][5]
- Watch: [config-files-watch.ts][6]
- RPCs: [rpc.ts][7]
- Apply + live events: [control-plane.ts][8]
- Worktree seed: [dev-runner.ts][9]

## Related

- [Provider instances](./provider-instances.md)
- [Glossary](./glossary.md)

[1]: ../../packages/shared/src/dev-home.ts
[2]: ../../packages/contracts/src/settings.ts
[3]: ../../packages/contracts/src/keybindings.ts
[4]: ../../apps/server/src/provider/provider-settings.ts
[5]: ../../apps/server/src/keybindings.ts
[6]: ../../apps/server/src/config-files-watch.ts
[7]: ../../packages/contracts/src/rpc.ts
[8]: ../../apps/server/src/control-plane.ts
[9]: ../../apps/desktop/scripts/dev-runner.ts
