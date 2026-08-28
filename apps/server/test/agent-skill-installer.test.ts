import * as NodeCrypto from "@effect/platform-node/NodeCrypto"
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import { assert, layer } from "@effect/vitest"
import { WorkspaceRoot } from "@noyau/contracts/entities/environment"
import { ProjectId } from "@noyau/contracts/ids"
import { AgentSkillInstaller, agentSkillInstallerLayer } from "@noyau/server/agent-skill/installer"
import { Effect, FileSystem, Layer, Path, Schema } from "effect"

const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")
const platformLayer = agentSkillInstallerLayer.pipe(
  Layer.provideMerge(NodeFileSystem.layer),
  Layer.provideMerge(Path.layer),
  Layer.provide(NodeCrypto.layer),
)

const workspace = (directory: string) => Schema.decodeEffect(WorkspaceRoot)(directory)

layer(platformLayer)("AgentSkillInstaller", (it) => {
  it.effect("installs, inspects, and removes the canonical skill", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const installer = yield* AgentSkillInstaller
      const directory = yield* fileSystem.makeTempDirectoryScoped({ prefix: "noyau-skill-" })
      const root = yield* workspace(directory)

      assert.strictEqual((yield* installer.inspect(projectId, root)).status, "absent")
      const installed = yield* installer.install(projectId, root)
      assert.strictEqual(installed.status, "current")
      assert.isTrue(yield* fileSystem.exists(path.join(installed.targetPath, "SKILL.md")))
      assert.match(
        yield* fileSystem.readFileString(path.join(installed.targetPath, "SKILL.md")),
        /name: noyau/u,
      )

      assert.strictEqual((yield* installer.remove(projectId, root)).status, "absent")
      assert.isFalse(yield* fileSystem.exists(installed.targetPath))
    }),
  )

  it.effect("never overwrites an unmanaged or locally modified skill", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const installer = yield* AgentSkillInstaller
      const directory = yield* fileSystem.makeTempDirectoryScoped({ prefix: "noyau-skill-" })
      const root = yield* workspace(directory)
      const target = path.join(directory, ".agents", "skills", "noyau")
      yield* fileSystem.makeDirectory(target, { recursive: true })
      yield* fileSystem.writeFileString(path.join(target, "SKILL.md"), "user-owned")

      assert.strictEqual((yield* installer.inspect(projectId, root)).status, "conflict")
      const unmanaged = yield* installer.install(projectId, root).pipe(Effect.flip)
      assert.strictEqual(unmanaged.reason, "conflict")

      yield* fileSystem.remove(target, { recursive: true })
      const installed = yield* installer.install(projectId, root)
      yield* fileSystem.writeFileString(path.join(installed.targetPath, "SKILL.md"), "local edit")
      assert.strictEqual((yield* installer.inspect(projectId, root)).status, "conflict")
      const modified = yield* installer.remove(projectId, root).pipe(Effect.flip)
      assert.strictEqual(modified.reason, "conflict")
      assert.strictEqual(
        yield* fileSystem.readFileString(path.join(installed.targetPath, "SKILL.md")),
        "local edit",
      )
    }),
  )

  it.effect("updates an intact managed version", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const installer = yield* AgentSkillInstaller
      const directory = yield* fileSystem.makeTempDirectoryScoped({ prefix: "noyau-skill-" })
      const root = yield* workspace(directory)
      const installed = yield* installer.install(projectId, root)
      const marker = path.join(installed.targetPath, ".noyau-install.json")
      const encoded = yield* fileSystem.readFileString(marker)
      yield* fileSystem.writeFileString(
        marker,
        encoded.replace('"version":"1.1.0"', '"version":"0.9.0"'),
      )

      assert.strictEqual((yield* installer.inspect(projectId, root)).status, "outdated")
      const updated = yield* installer.install(projectId, root)
      assert.strictEqual(updated.status, "current")
      assert.strictEqual(updated.installedVersion, "1.1.0")
    }),
  )

  it.effect("rejects a skills directory that escapes through a symlink", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const installer = yield* AgentSkillInstaller
      const directory = yield* fileSystem.makeTempDirectoryScoped({ prefix: "noyau-skill-" })
      const outside = yield* fileSystem.makeTempDirectoryScoped({ prefix: "noyau-skill-outside-" })
      const root = yield* workspace(directory)
      yield* fileSystem.makeDirectory(path.join(directory, ".agents"))
      yield* fileSystem.symlink(outside, path.join(directory, ".agents", "skills"))

      const failure = yield* installer.install(projectId, root).pipe(Effect.flip)
      assert.strictEqual(failure.reason, "unsafe-path")
      assert.isFalse(yield* fileSystem.exists(path.join(outside, "noyau")))
    }),
  )
})
