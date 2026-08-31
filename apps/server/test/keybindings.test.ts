import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import { assert, layer } from "@effect/vitest"
import { MAX_KEYBINDINGS_COUNT } from "@noyau/contracts/keybindings"
import { ServerConfig } from "@noyau/server/config"
import { readKeybindingsRules, writeKeybindingsRules } from "@noyau/server/keybindings"
import { Effect, FileSystem, Layer, Path } from "effect"

import { testServerConfig } from "./fixtures.ts"

const platformLayer = Layer.mergeAll(NodeFileSystem.layer, Path.layer)

layer(platformLayer)((it) => {
  it.effect("un fichier absent est une overlay vide", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const directory = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "noyau-keybindings-",
      })
      const read = yield* readKeybindingsRules().pipe(
        Effect.provideService(ServerConfig, testServerConfig({ dataDirectory: directory })),
      )
      assert.deepStrictEqual(read, { rules: [], ok: true })
    }),
  )

  it.effect("écrit et relit une overlay pretty-printed", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const directory = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "noyau-keybindings-",
      })
      const config = testServerConfig({ dataDirectory: directory })
      const rules = [{ key: "mod+j", command: "palette.open" }]
      yield* writeKeybindingsRules(rules).pipe(Effect.provideService(ServerConfig, config))
      const encoded = yield* fileSystem.readFileString(path.join(directory, "keybindings.json"))
      assert.strictEqual(encoded.includes("\n  "), true)
      const read = yield* readKeybindingsRules().pipe(Effect.provideService(ServerConfig, config))
      assert.deepStrictEqual(read, { rules, ok: true })
    }),
  )

  it.effect("un JSON invalide ne casse pas le read", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const directory = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "noyau-keybindings-",
      })
      yield* fileSystem.writeFileString(path.join(directory, "keybindings.json"), "{not-json")
      const read = yield* readKeybindingsRules().pipe(
        Effect.provideService(ServerConfig, testServerConfig({ dataDirectory: directory })),
      )
      assert.deepStrictEqual(read, { rules: [], ok: false })
    }),
  )

  it.effect("retourne uniquement les règles persistées au-delà de 256", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const directory = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "noyau-keybindings-",
      })
      const config = testServerConfig({ dataDirectory: directory })
      const rules = Array.from({ length: MAX_KEYBINDINGS_COUNT + 3 }, (_, index) => ({
        key: `mod+${String(index)}`,
        command: "palette.open",
      }))
      const written = yield* writeKeybindingsRules(rules).pipe(
        Effect.provideService(ServerConfig, config),
      )
      assert.strictEqual(written.length, MAX_KEYBINDINGS_COUNT)
      const read = yield* readKeybindingsRules().pipe(Effect.provideService(ServerConfig, config))
      assert.deepStrictEqual(read, { rules: written, ok: true })
    }),
  )
})
