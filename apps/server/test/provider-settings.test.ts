import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import { assert, layer } from "@effect/vitest"
import { ProviderInstanceId } from "@noyau/contracts/entities/environment"
import {
  DEFAULT_SERVER_SETTINGS,
  hydrateProviderInstanceConfigs,
  resolveHydratedInstanceEnabled,
} from "@noyau/contracts/settings"
import { ServerConfig } from "@noyau/server/config"
import { patchServerSettings, readServerSettings } from "@noyau/server/provider/provider-settings"
import { Effect, FileSystem, Layer, Path } from "effect"

import { testServerConfig } from "./fixtures.ts"

const platformLayer = Layer.mergeAll(NodeFileSystem.layer, Path.layer)

layer(platformLayer)((it) => {
  it.effect("un fichier absent hydrate les trois built-ins activés", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const directory = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "noyau-settings-",
      })
      const settings = yield* readServerSettings().pipe(
        Effect.provideService(ServerConfig, testServerConfig({ dataDirectory: directory })),
      )
      assert.deepStrictEqual(settings, DEFAULT_SERVER_SETTINGS)
      const hydrated = hydrateProviderInstanceConfigs(settings)
      assert.strictEqual(
        resolveHydratedInstanceEnabled(ProviderInstanceId.make("cursor"), hydrated),
        true,
      )
      assert.strictEqual(
        resolveHydratedInstanceEnabled(ProviderInstanceId.make("claude"), hydrated),
        true,
      )
      assert.strictEqual(
        resolveHydratedInstanceEnabled(ProviderInstanceId.make("codex"), hydrated),
        true,
      )
    }),
  )

  it.effect("un enabled: false survit à l'écriture", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const directory = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "noyau-settings-",
      })
      const config = testServerConfig({ dataDirectory: directory })
      const written = yield* patchServerSettings({
        providerInstances: {
          [ProviderInstanceId.make("cursor")]: { enabled: false },
        },
      }).pipe(Effect.provideService(ServerConfig, config))
      const read = yield* readServerSettings().pipe(Effect.provideService(ServerConfig, config))
      assert.strictEqual(
        resolveHydratedInstanceEnabled(
          ProviderInstanceId.make("cursor"),
          hydrateProviderInstanceConfigs(written),
        ),
        false,
      )
      assert.deepStrictEqual(read, written)
    }),
  )

  it.effect("persists and clears the text generation model", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const directory = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "noyau-settings-text-model-",
      })
      const config = testServerConfig({ dataDirectory: directory })
      const selected = yield* patchServerSettings({
        textGenerationModel: {
          modelId: "composer-2.5-fast",
          reasoningEffort: "high",
          serviceTier: "fast",
        },
      }).pipe(Effect.provideService(ServerConfig, config))
      assert.deepStrictEqual(selected.textGenerationModel, {
        modelId: "composer-2.5-fast",
        reasoningEffort: "high",
        serviceTier: "fast",
      })
      const cleared = yield* patchServerSettings({ textGenerationModel: null }).pipe(
        Effect.provideService(ServerConfig, config),
      )
      assert.strictEqual(cleared.textGenerationModel, null)
    }),
  )

  it.effect("copie settings.json hors de dataDirectory vers configDirectory", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const dataDirectory = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "noyau-settings-data-",
      })
      const configDirectory = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "noyau-settings-config-",
      })
      yield* fileSystem.writeFileString(
        path.join(dataDirectory, "settings.json"),
        '{"providerInstances":{"cursor":{"driver":"cursor","enabled":false}}}',
      )
      const config = testServerConfig({ dataDirectory, configDirectory })
      const read = yield* readServerSettings().pipe(Effect.provideService(ServerConfig, config))
      assert.strictEqual(
        resolveHydratedInstanceEnabled(
          ProviderInstanceId.make("cursor"),
          hydrateProviderInstanceConfigs(read),
        ),
        false,
      )
      assert.strictEqual(
        yield* fileSystem.exists(path.join(configDirectory, "settings.json")),
        true,
      )
    }),
  )
})
