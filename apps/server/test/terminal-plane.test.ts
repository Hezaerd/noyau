import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import { assert, layer } from "@effect/vitest"
import { ProjectId, ThreadId } from "@noyau/contracts/ids"
import { TerminalNotRunningError, TerminalSessionLookupError } from "@noyau/contracts/terminal"
import { PtyAdapter, type PtyExitEvent, type PtyProcess } from "@noyau/server/terminal/pty-adapter"
import { makeTerminalPlane, TerminalPlane } from "@noyau/server/terminal/terminal-plane"
import { Effect, FileSystem, Layer, Path, Stream } from "effect"

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

const testLayer = (cwd: string, processHandle: FakePtyProcess) =>
  Layer.effect(
    TerminalPlane,
    makeTerminalPlane({
      resolveCwd: () => Effect.succeed({ cwd }),
    }),
  ).pipe(
    Layer.provide(
      Layer.succeed(PtyAdapter)(
        PtyAdapter.of({
          spawn: () => Effect.succeed(processHandle),
        }),
      ),
    ),
    Layer.provide(NodeFileSystem.layer),
    Layer.provide(Path.layer),
  )

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

layer(Layer.mergeAll(NodeFileSystem.layer, Path.layer))("TerminalPlane", (it) => {
  it.effect("attache une session, écrit, et ferme le PTY", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const cwd = yield* fileSystem.makeTempDirectoryScoped({ prefix: "noyau-terminal-" })
      const processHandle = new FakePtyProcess()
      const plane = yield* TerminalPlane.pipe(Effect.provide(testLayer(cwd, processHandle)))

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

  it.effect("refuse write sur une session inconnue ou déjà fermée", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const cwd = yield* fileSystem.makeTempDirectoryScoped({ prefix: "noyau-terminal-" })
      const processHandle = new FakePtyProcess()
      const plane = yield* TerminalPlane.pipe(Effect.provide(testLayer(cwd, processHandle)))

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

  it.effect("redémarre en vidant l'histoire", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const cwd = yield* fileSystem.makeTempDirectoryScoped({ prefix: "noyau-terminal-" })
      const processHandle = new FakePtyProcess()
      const plane = yield* TerminalPlane.pipe(Effect.provide(testLayer(cwd, processHandle)))

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

  it.effect("refuse write après un exit sans restart", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const cwd = yield* fileSystem.makeTempDirectoryScoped({ prefix: "noyau-terminal-" })
      const processHandle = new FakePtyProcess()
      const plane = yield* TerminalPlane.pipe(Effect.provide(testLayer(cwd, processHandle)))

      yield* snapshotOf(plane, "term-1")
      processHandle.kill()
      const stopped = yield* Effect.flip(
        plane.write({ projectId, threadId, terminalId: "term-1", data: "x" }),
      )
      assert.instanceOf(stopped, TerminalNotRunningError)
    }),
  )
})
