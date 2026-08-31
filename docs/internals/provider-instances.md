# Provider instances

> For maintainers. Using Noyau? See [docs/users/providers.md](../users/providers.md).

A [provider](./glossary.md#provider) on a Thread is an instance id. A
[driver](./glossary.md#driver) is the adapter that implements that slot. The
split lets a later cut host two Codex slots without rewriting the journal.

## How it works

`settings.json` under the [config directory](./settings.md) stores
`{ providerInstances: Record<instanceId, { driver, enabled?, displayName?, config? }> }`.
It is not event-sourced. An empty or missing file hydrates the three built-in
ids `cursor`, `claude`, and `codex`, all enabled. Explicit `enabled: false`
wins. An unknown driver defaults disabled.

[provider-settings.ts][1] reads and patches the file. `server.getSettings` and
`server.patchSettings` are the RPCs. A patch rebuilds the
[registry][2] and publishes `environment-updated` on the shell stream. The
client applies that tag even when its sequence is already in the snapshot.

The registry skips probe and spawn when an instance is disabled.
`composeProviderPorts` routes `startTurn` by instance id and does not fall
through to Cursor. A missing or disabled id emits a session error and
`turn-ended`.

[Environment](./glossary.md#environment) is a map of
[ProviderInstanceView][3]: identity, driver, enabled, and the last probe.
Adapters return a one-key map for their own instance. Binary path is
`NOYAU_*_PATH`, then adapter options, then `config.binaryPath`.

SQLite migration `014` rebuilds `projection_threads` and drops the closed
`provider` CHECK (it already omitted `claude`).

## Where it lives

- Instance and driver slugs: [provider-instance.ts][4]
- Settings schema and hydrate/merge: [settings.ts][5]
- File I/O: [provider-settings.ts][1]
- Registry: [provider-instance-registry.ts][2]
- Environment map: [environment.ts][3]
- Settings RPCs: [rpc.ts][6]
- Control plane apply + live event: [control-plane.ts][7]

## Related

- [Glossary](./glossary.md)
- [Turn a provider on or off](../users/providers.md)

[1]: ../../apps/server/src/provider/provider-settings.ts
[2]: ../../apps/server/src/provider/provider-instance-registry.ts
[3]: ../../packages/contracts/src/entities/environment.ts
[4]: ../../packages/contracts/src/entities/provider-instance.ts
[5]: ../../packages/contracts/src/settings.ts
[6]: ../../packages/contracts/src/rpc.ts
[7]: ../../apps/server/src/control-plane.ts
