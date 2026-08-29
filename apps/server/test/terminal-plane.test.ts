import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import { assert, layer } from "@effect/vitest"
import { ProjectId, ThreadId } from "@noyau/contracts/ids"
import { TerminalNotRunningError, TerminalSessionLookupError } from "@noyau/contracts/terminal"
import { PtyAdapter, type PtyExitEvent, type PtyProcess } from "@noyau/server/terminal/pty-adapter"
import { makeTerminalPlane, TerminalPlane } from "@noyau/server/terminal/terminal-plane"
import { Deferred, Effect, Fiber, FileSystem, Layer, Path, Stream } from "effect"

class FakePtyProcess implements PtyProcess {
  readonly pid = 4242
  private readonly dataListeners = new Set<(data: string) => void>()
  private readonly exitListeners = new Set<(event: PtyExitEvent) => void>()
  readonly written: string[] = []
  killed = false

  write(data: string): void {
    this.written.push(data)
    for (const listener of this.dataListeners) {
      listener(data)
    }
  }

  resize(): void {}

  kill(): void {
    this.killed = true
    for (const listener of this.exitListeners) {
      listener({ exitCode: 0, signal: null })
    }
  }

  onData(callback: (data: string) => void): () => void {
    this.dataListeners.add(callback)
    return () => {
      this.dataListeners.delete(callback)
    }
  }

  onExit(callback: (event: PtyExitEvent) => void): () => void {
    this.exitListeners.add(callback)
    return () => {
      this.exitListeners.delete(callback)
    }
  }
}

const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")
const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")

const snapshotOf = (plane: TerminalPlane["Service"], terminalId: string) =>
  Stream.runCollect(plane.attach({ projectId, threadId, terminalId }).pipe(Stream.take(1))).pipe(
    Effect.map((events) => {
      const first = events[0]
      if (first?._tag !== "snapshot") {
        throw new Error(`expected snapshot, got ${first?._tag}`)
      }
      return first.snapshot
    }),
  )

const withPlane = <A, E, R>(
  cwd: string,
  processHandle: FakePtyProcess,
  body: (plane: TerminalPlane["Service"]) => Effect.Effect<A, E, R>,
  spawn: () => Effect.Effect<PtyProcess> = () => Effect.succeed(processHandle),
) =>
  Effect.gen(function* () {
    const plane = yield* TerminalPlane
    return yield* body(plane)
  }).pipe(
    Effect.provide(
      Layer.effect(
        TerminalPlane,
        makeTerminalPlane({
          resolveCwd: () => Effect.succeed({ cwd }),
        }),
      ).pipe(
        Layer.provide(Layer.succeed(PtyAdapter)(PtyAdapter.of({ spawn }))),
        Layer.provide(NodeFileSystem.layer),
        Layer.provide(Path.layer),
      ),
    ),
  )

layer(Layer.mergeAll(NodeFileSystem.layer, Path.layer))("TerminalPlane", (it) => {
  it.effect("attache une session, écrit, et ferme le PTY", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const cwd = yield* fileSystem.makeTempDirectoryScoped({ prefix: "noyau-terminal-" })
      const processHandle = new FakePtyProcess()
      yield* withPlane(cwd, processHandle, (plane) =>
        Effect.gen(function* () {
          const opened = yield* snapshotOf(plane, "term-1")
          assert.strictEqual(opened.cwd, cwd)
          assert.strictEqual(opened.status, "running")
          assert.strictEqual(opened.pid, 4242)
          assert.strictEqual(opened.history, "")

          yield* plane.write({ projectId, threadId, terminalId: "term-1", data: "ls\n" })
          assert.deepStrictEqual(processHandle.written, ["ls\n"])

          const replayed = yield* snapshotOf(plane, "term-1")
          assert.strictEqual(replayed.history, "ls\n")

          yield* plane.close({ projectId, threadId, terminalId: "term-1" })
          assert.isTrue(processHandle.killed)
        }),
      )
    }),
  )

  it.effect("refuse write sur une session inconnue ou déjà fermée", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const cwd = yield* fileSystem.makeTempDirectoryScoped({ prefix: "noyau-terminal-" })
      const processHandle = new FakePtyProcess()
      yield* withPlane(cwd, processHandle, (plane) =>
        Effect.gen(function* () {
          const missing = yield* Effect.flip(
            plane.write({ projectId, threadId, terminalId: "missing", data: "x" }),
          )
          assert.instanceOf(missing, TerminalSessionLookupError)

          yield* snapshotOf(plane, "term-1")
          yield* plane.close({ projectId, threadId, terminalId: "term-1" })
          const stopped = yield* Effect.flip(
            plane.write({ projectId, threadId, terminalId: "term-1", data: "x" }),
          )
          assert.instanceOf(stopped, TerminalSessionLookupError)
        }),
      )
    }),
  )

  it.effect("redémarre en vidant l'histoire", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const cwd = yield* fileSystem.makeTempDirectoryScoped({ prefix: "noyau-terminal-" })
      const processHandle = new FakePtyProcess()
      yield* withPlane(cwd, processHandle, (plane) =>
        Effect.gen(function* () {
          yield* snapshotOf(plane, "term-1")
          yield* plane.write({ projectId, threadId, terminalId: "term-1", data: "old\n" })
          const snapshot = yield* plane.restart({
            projectId,
            threadId,
            terminalId: "term-1",
            cols: 80,
            rows: 24,
          })
          assert.strictEqual(snapshot.history, "")
          assert.strictEqual(snapshot.status, "running")
        }),
      )
    }),
  )

  it.effect("refuse write après un exit sans restart", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const cwd = yield* fileSystem.makeTempDirectoryScoped({ prefix: "noyau-terminal-" })
      const processHandle = new FakePtyProcess()
      yield* withPlane(cwd, processHandle, (plane) =>
        Effect.gen(function* () {
          yield* snapshotOf(plane, "term-1")
          processHandle.kill()
          const stopped = yield* Effect.flip(
            plane.write({ projectId, threadId, terminalId: "term-1", data: "x" }),
          )
          assert.instanceOf(stopped, TerminalNotRunningError)
        }),
      )
    }),
  )

  it.effect("borne l'historique sans saut de ligne", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const cwd = yield* fileSystem.makeTempDirectoryScoped({ prefix: "noyau-terminal-" })
      const processHandle = new FakePtyProcess()
      yield* withPlane(cwd, processHandle, (plane) =>
        Effect.gen(function* () {
          yield* snapshotOf(plane, "term-1")
          processHandle.write("x".repeat(1_500_000))
          const replayed = yield* snapshotOf(plane, "term-1")
          assert.isTrue(replayed.history.length <= 1_000_000)
          assert.strictEqual(replayed.history, "x".repeat(1_000_000))
        }),
      )
    }),
  )

  it.effect("n'ouvre qu'un PTY quand deux attach concurrents partagent l'id", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const cwd = yield* fileSystem.makeTempDirectoryScoped({ prefix: "noyau-terminal-" })
      const processHandle = new FakePtyProcess()
      const started = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      let spawns = 0
      yield* withPlane(
        cwd,
        processHandle,
        (plane) =>
          Effect.gen(function* () {
            const first = yield* Effect.forkChild(snapshotOf(plane, "term-1"))
            yield* Deferred.await(started)
            const second = yield* Effect.forkChild(snapshotOf(plane, "term-1"))
            yield* Deferred.succeed(release, undefined)
            const firstSnapshot = yield* Fiber.join(first)
            const secondSnapshot = yield* Fiber.join(second)
            assert.strictEqual(firstSnapshot.pid, 4242)
            assert.strictEqual(secondSnapshot.pid, 4242)
            assert.strictEqual(spawns, 1)
          }),
        () =>
          Effect.gen(function* () {
            spawns += 1
            yield* Deferred.succeed(started, undefined)
            yield* Deferred.await(release)
            return processHandle
          }),
      )
    }),
  )
})
