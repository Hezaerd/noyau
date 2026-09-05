import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import * as NodePath from "@effect/platform-node/NodePath"
import { assert, layer } from "@effect/vitest"
import {
  SEARCH_WORKSPACE_SCAN_LIMIT,
  SEARCH_WORKSPACE_STAT_CONCURRENCY,
  searchWorkspacePathsInRoot,
} from "@noyau/server/workspace-path-search"
import { Deferred, Effect, Fiber, FileSystem, Layer, Path, Ref } from "effect"

const platformLayer = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)

layer(platformLayer)("searchWorkspacePathsInRoot", (it) => {
  it.effect("ranks basename matches and skips ignored directories", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const workspace = yield* fileSystem.makeTempDirectoryScoped({ prefix: "noyau-paths-" })
      yield* fileSystem.makeDirectory(path.join(workspace, "src"), { recursive: true })
      yield* fileSystem.writeFileString(path.join(workspace, "src/adapter.ts"), "export {}\n")
      yield* fileSystem.writeFileString(path.join(workspace, "src/other.ts"), "export {}\n")
      yield* fileSystem.makeDirectory(path.join(workspace, "node_modules", "pkg"), {
        recursive: true,
      })
      yield* fileSystem.writeFileString(path.join(workspace, "node_modules/pkg/adapter.ts"), "")

      const result = yield* searchWorkspacePathsInRoot(workspace, "adapter")
      assert.deepStrictEqual(result.entries, [{ path: "src/adapter.ts", kind: "file" }])
    }),
  )

  it.effect("includes .agents files and directories for empty queries", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const workspace = yield* fileSystem.makeTempDirectoryScoped({ prefix: "noyau-agents-" })
      yield* fileSystem.makeDirectory(path.join(workspace, ".agents", "skills", "grill"), {
        recursive: true,
      })
      yield* fileSystem.writeFileString(
        path.join(workspace, ".agents/skills/grill/SKILL.md"),
        "# Grill\n",
      )

      const result = yield* searchWorkspacePathsInRoot(workspace, "skill")
      assert.ok(result.entries.some((entry) => entry.path === ".agents/skills/grill/SKILL.md"))
    }),
  )

  it.effect("bounds concurrent stat calls and interrupts them with the search", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const workspace = yield* fileSystem.makeTempDirectoryScoped({ prefix: "noyau-paths-" })
      const sampleFile = yield* fileSystem.makeTempFileScoped()
      const sampleInfo = yield* fileSystem.stat(sampleFile)
      const names = Array.from(
        { length: SEARCH_WORKSPACE_STAT_CONCURRENCY + 1 },
        (_, index) => `file-${index}.ts`,
      )

      const reachedLimit = yield* Deferred.make<void>()
      const releaseStats = yield* Deferred.make<void>()
      const inFlight = yield* Ref.make(0)
      const maxInFlight = yield* Ref.make(0)
      const interrupted = yield* Ref.make(0)
      const instrumentedFileSystem = FileSystem.FileSystem.of({
        ...fileSystem,
        readDirectory: () => Effect.succeed(names),
        stat: () =>
          Effect.acquireUseRelease(
            Ref.modify(inFlight, (current) => {
              const next = current + 1
              return [next, next] as const
            }).pipe(
              Effect.tap((current) =>
                Ref.update(maxInFlight, (maximum) => Math.max(maximum, current)),
              ),
              Effect.tap((current) =>
                current === SEARCH_WORKSPACE_STAT_CONCURRENCY
                  ? Deferred.succeed(reachedLimit, undefined)
                  : Effect.void,
              ),
            ),
            () => Deferred.await(releaseStats).pipe(Effect.as(sampleInfo)),
            () => Ref.update(inFlight, (current) => current - 1),
          ).pipe(Effect.onInterrupt(() => Ref.update(interrupted, (count) => count + 1))),
      })

      const search = yield* searchWorkspacePathsInRoot(workspace, "").pipe(
        Effect.provideService(FileSystem.FileSystem, instrumentedFileSystem),
        Effect.forkChild,
      )
      yield* Deferred.await(reachedLimit)
      assert.strictEqual(yield* Ref.get(maxInFlight), SEARCH_WORKSPACE_STAT_CONCURRENCY)
      assert.strictEqual(yield* Ref.get(inFlight), SEARCH_WORKSPACE_STAT_CONCURRENCY)

      yield* Fiber.interrupt(search)
      assert.strictEqual(yield* Ref.get(inFlight), 0)
      assert.strictEqual(yield* Ref.get(interrupted), SEARCH_WORKSPACE_STAT_CONCURRENCY)
    }),
  )

  it.effect("does not stat entries beyond the scan limit", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const workspace = yield* fileSystem.makeTempDirectoryScoped({ prefix: "noyau-paths-" })
      const sampleFile = path.join(workspace, "sample.ts")
      yield* fileSystem.writeFileString(sampleFile, "")
      const sampleInfo = yield* fileSystem.stat(sampleFile)
      const statCalls = yield* Ref.make<Array<string>>([])
      const names = Array.from(
        { length: SEARCH_WORKSPACE_SCAN_LIMIT + 1 },
        (_, index) => `file-${index.toString().padStart(4, "0")}.ts`,
      )
      const instrumentedFileSystem = FileSystem.FileSystem.of({
        ...fileSystem,
        readDirectory: () => Effect.succeed(names),
        stat: (filePath) =>
          Ref.update(statCalls, (calls) => [...calls, filePath]).pipe(Effect.as(sampleInfo)),
      })

      const result = yield* searchWorkspacePathsInRoot(workspace, "").pipe(
        Effect.provideService(FileSystem.FileSystem, instrumentedFileSystem),
      )
      const calls = yield* Ref.get(statCalls)

      assert.strictEqual(calls.length, SEARCH_WORKSPACE_SCAN_LIMIT)
      assert.ok(calls.every((filePath) => !filePath.endsWith(names.at(-1)!)))
      assert.deepStrictEqual(result.entries.slice(0, 2), [
        { path: "file-0000.ts", kind: "file" },
        { path: "file-0001.ts", kind: "file" },
      ])
    }),
  )

  it.effect("ignores individual stat failures", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const workspace = yield* fileSystem.makeTempDirectoryScoped({ prefix: "noyau-paths-" })
      const sampleFile = yield* fileSystem.makeTempFileScoped()
      const sampleInfo = yield* fileSystem.stat(sampleFile)
      const instrumentedFileSystem = FileSystem.FileSystem.of({
        ...fileSystem,
        readDirectory: () => Effect.succeed(["good.ts", "missing.ts"]),
        stat: (filePath) =>
          path.basename(filePath) === "missing.ts"
            ? fileSystem.stat(filePath)
            : Effect.succeed(sampleInfo),
      })

      const result = yield* searchWorkspacePathsInRoot(workspace, "").pipe(
        Effect.provideService(FileSystem.FileSystem, instrumentedFileSystem),
      )

      assert.deepStrictEqual(result.entries, [{ path: "good.ts", kind: "file" }])
    }),
  )

  it.effect("keeps breadth-first order when directory stats finish out of order", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const workspace = yield* fileSystem.makeTempDirectoryScoped({ prefix: "noyau-paths-" })
      const firstDirectory = path.join(workspace, "first")
      const secondDirectory = path.join(workspace, "second")
      const sampleDirectory = yield* fileSystem.makeTempDirectoryScoped()
      const sampleFile = yield* fileSystem.makeTempFileScoped()
      const directoryInfo = yield* fileSystem.stat(sampleDirectory)
      const fileInfo = yield* fileSystem.stat(sampleFile)
      const bothStatsStarted = yield* Deferred.make<void>()
      const releaseFirst = yield* Deferred.make<void>()
      const releaseSecond = yield* Deferred.make<void>()
      const secondFinished = yield* Deferred.make<void>()
      const rootStatsStarted = yield* Ref.make(0)
      const directoriesRead = yield* Ref.make<Array<string>>([])
      const firstDirectoryNames = Array.from(
        { length: SEARCH_WORKSPACE_SCAN_LIMIT - 2 },
        (_, index) => `kept-${index.toString().padStart(4, "0")}.ts`,
      )
      const instrumentedFileSystem = FileSystem.FileSystem.of({
        ...fileSystem,
        readDirectory: (directory) =>
          Ref.update(directoriesRead, (directories) => [...directories, directory]).pipe(
            Effect.andThen(
              directory === workspace
                ? Effect.succeed(["first", "second"])
                : directory === firstDirectory
                  ? Effect.succeed(firstDirectoryNames)
                  : Effect.succeed(["excluded.ts"]),
            ),
          ),
        stat: (filePath) => {
          if (filePath === firstDirectory || filePath === secondDirectory) {
            const release = filePath === firstDirectory ? releaseFirst : releaseSecond
            return Ref.updateAndGet(rootStatsStarted, (count) => count + 1).pipe(
              Effect.tap((count) =>
                count === 2 ? Deferred.succeed(bothStatsStarted, undefined) : Effect.void,
              ),
              Effect.andThen(Deferred.await(release)),
              Effect.tap(() =>
                filePath === secondDirectory
                  ? Deferred.succeed(secondFinished, undefined)
                  : Effect.void,
              ),
              Effect.as(directoryInfo),
            )
          }
          return Effect.succeed(fileInfo)
        },
      })

      const search = yield* searchWorkspacePathsInRoot(workspace, "excluded").pipe(
        Effect.provideService(FileSystem.FileSystem, instrumentedFileSystem),
        Effect.forkChild,
      )
      yield* Deferred.await(bothStatsStarted)
      yield* Deferred.succeed(releaseSecond, undefined)
      yield* Deferred.await(secondFinished)
      yield* Deferred.succeed(releaseFirst, undefined)
      const result = yield* Fiber.join(search)

      assert.deepStrictEqual(result.entries, [])
      assert.deepStrictEqual(yield* Ref.get(directoriesRead), [workspace, firstDirectory])
    }),
  )
})
