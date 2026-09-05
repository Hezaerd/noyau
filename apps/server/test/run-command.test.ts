import * as NodeServices from "@effect/platform-node/NodeServices"
import { assert, layer } from "@effect/vitest"
import { runCommand } from "@noyau/server/git/run-command"
import { Effect, Layer, Sink, Stream } from "effect"
import * as PlatformError from "effect/PlatformError"
import { TestClock } from "effect/testing"
import { ChildProcessSpawner } from "effect/unstable/process"

interface ProcessOutput {
  readonly stdout: ReadonlyArray<Uint8Array>
  readonly stderr: ReadonlyArray<Uint8Array>
  readonly code?: number
  readonly stdoutError?: PlatformError.PlatformError
  readonly stderrError?: PlatformError.PlatformError
}

const outputStream = (
  chunks: ReadonlyArray<Uint8Array>,
  error: PlatformError.PlatformError | undefined,
) => {
  const stream = Stream.fromIterable(chunks)
  return error === undefined ? stream : Stream.concat(stream, Stream.fail(error))
}

const processOutputLayer = (output: ProcessOutput) =>
  Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make(() =>
      Effect.succeed(
        ChildProcessSpawner.makeHandle({
          pid: ChildProcessSpawner.ProcessId(1),
          stdin: Sink.drain,
          stdout: outputStream(output.stdout, output.stdoutError),
          stderr: outputStream(output.stderr, output.stderrError),
          all: Stream.empty,
          exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(output.code ?? 0)),
          isRunning: Effect.succeed(false),
          kill: () => Effect.void,
          getInputFd: () => Sink.drain,
          getOutputFd: () => Stream.empty,
          unref: Effect.succeed(Effect.void),
        }),
      ),
    ),
  )

const runFixture = runCommand("test.output", "fixture", [], "/repo")

layer(NodeServices.layer)("Git command execution", (it) => {
  it.effect("decodes split UTF-8, BOM, malformed trailing bytes, and repeats independently", () =>
    Effect.gen(function* () {
      const context = yield* Layer.build(
        processOutputLayer({
          stdout: [
            new Uint8Array([0xef]),
            new Uint8Array([0xbb, 0xbf, 0xf0]),
            new Uint8Array([0x9f, 0x98]),
            new Uint8Array([0x80]),
            new TextEncoder().encode(" done"),
          ],
          stderr: [new Uint8Array([0x41, 0xe2]), new Uint8Array([0x82])],
        }),
      )
      const first = yield* runFixture.pipe(Effect.provideContext(context))
      const second = yield* runFixture.pipe(Effect.provideContext(context))

      assert.deepStrictEqual(first, { stdout: "😀 done", stderr: "A�", code: 0 })
      assert.deepStrictEqual(second, first)
    }),
  )

  it.effect("returns empty output without requiring a chunk", () =>
    Effect.gen(function* () {
      const context = yield* Layer.build(processOutputLayer({ stdout: [], stderr: [] }))
      const result = yield* runFixture.pipe(Effect.provideContext(context))

      assert.deepStrictEqual(result, { stdout: "", stderr: "", code: 0 })
    }),
  )

  it.effect("maps stdout and stderr stream failures without returning partial output", () =>
    Effect.gen(function* () {
      const stdoutError = PlatformError.systemError({
        _tag: "Unknown",
        module: "test",
        method: "stdout",
        description: "stdout failed",
      })
      const stdoutContext = yield* Layer.build(
        processOutputLayer({
          stdout: [new TextEncoder().encode("partial")],
          stderr: [],
          stdoutError,
        }),
      )
      const stdoutFailure = yield* runFixture.pipe(
        Effect.provideContext(stdoutContext),
        Effect.flip,
      )
      assert.strictEqual(stdoutFailure.operation, "test.output")
      assert.include(stdoutFailure.detail, "stdout failed")

      const stderrError = PlatformError.systemError({
        _tag: "Unknown",
        module: "test",
        method: "stderr",
        description: "stderr failed",
      })
      const stderrContext = yield* Layer.build(
        processOutputLayer({ stdout: [], stderr: [], stderrError }),
      )
      const stderrFailure = yield* runFixture.pipe(
        Effect.provideContext(stderrContext),
        Effect.flip,
      )
      assert.strictEqual(stderrFailure.operation, "test.output")
      assert.include(stderrFailure.detail, "stderr failed")
    }),
  )

  it.effect("kills a timed-out command's process group", () =>
    TestClock.withLive(
      Effect.gen(function* () {
        const error = yield* runCommand(
          "test.timeout",
          process.execPath,
          [
            "-e",
            "const { spawn } = require('node:child_process'); spawn(process.execPath, ['-e', 'setTimeout(() => undefined, 5000)'], { stdio: 'inherit' }); setTimeout(() => undefined, 5000)",
          ],
          process.cwd(),
          { timeout: "100 millis" },
        ).pipe(Effect.flip)
        assert.strictEqual(error.operation, "test.timeout")
        assert.strictEqual(error.detail, `${process.execPath} timed out`)
      }),
    ),
  )
})
