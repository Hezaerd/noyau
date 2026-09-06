import { GitCommandError } from "@noyau/contracts/git"
import { Effect, Schema, Stream, type Duration } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"

const collectProcessText = <E>(stream: Stream.Stream<Uint8Array, E>) => {
  return Effect.suspend(() => {
    const decoder = new TextDecoder()
    return stream.pipe(
      Stream.runFold(
        () => new Array<string>(),
        (chunks, chunk) => {
          const decoded = decoder.decode(chunk, { stream: true })
          if (decoded.length > 0) {
            chunks.push(decoded)
          }
          return chunks
        },
      ),
      Effect.map((chunks) => {
        const trailing = decoder.decode()
        if (trailing.length > 0) {
          chunks.push(trailing)
        }
        return chunks.join("")
      }),
    )
  })
}

export interface CommandResult {
  readonly stdout: string
  readonly stderr: string
  readonly code: number
}

export const runCommand = Effect.fn("GitRuntime.runCommand")(function* (
  operation: string,
  executable: string,
  args: ReadonlyArray<string>,
  cwd: string,
  options: {
    readonly allowNonZero?: boolean
    readonly env?: Record<string, string>
    readonly stdin?: string
    readonly timeout?: Duration.Input
  } = {},
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const handle = yield* spawner
    .spawn(
      ChildProcess.make(
        executable,
        args,
        Object.assign(
          {
            cwd,
            detached: true,
            windowsHide: true,
          },
          options.env === undefined ? {} : { env: options.env, extendEnv: true },
          options.stdin === undefined
            ? {}
            : { stdin: Stream.make(options.stdin).pipe(Stream.encodeText) },
        ),
      ),
    )
    .pipe(
      Effect.mapError(
        (cause) =>
          new GitCommandError({
            operation,
            detail: cause instanceof Error ? cause.message : `Failed to spawn ${executable}`,
          }),
      ),
    )
  const output = Effect.all(
    [
      collectProcessText(handle.stdout),
      collectProcessText(handle.stderr),
      handle.exitCode.pipe(Effect.map(Number)),
    ],
    { concurrency: "unbounded" },
  ).pipe(Effect.onInterrupt(() => handle.kill({ killSignal: "SIGKILL" }).pipe(Effect.ignore)))
  const outputWithTimeout =
    options.timeout === undefined
      ? output
      : Effect.timeoutOrElse(output, {
          duration: options.timeout,
          orElse: () =>
            Effect.fail(
              new GitCommandError({
                operation,
                detail: `${executable} timed out`,
              }),
            ),
        })
  const [stdout, stderr, exitCode] = yield* outputWithTimeout.pipe(
    Effect.mapError((cause) =>
      Schema.is(GitCommandError)(cause)
        ? cause
        : new GitCommandError({
            operation,
            detail: cause instanceof Error ? cause.message : `${executable} failed`,
          }),
    ),
  )
  const result: CommandResult = { stdout, stderr, code: exitCode }
  if (result.code !== 0 && options.allowNonZero !== true) {
    const detail =
      result.stderr.trim() || result.stdout.trim() || `${executable} exited ${result.code}`
    return yield* new GitCommandError({ operation, detail })
  }
  return result
})

export const runGit = (
  operation: string,
  cwd: string,
  args: ReadonlyArray<string>,
  options: {
    readonly allowNonZero?: boolean
    readonly env?: Record<string, string>
    readonly stdin?: string
    readonly timeout?: Duration.Input
  } = {},
) => runCommand(operation, "git", args, cwd, options)

export const runGh = (
  operation: string,
  cwd: string,
  args: ReadonlyArray<string>,
  options: {
    readonly allowNonZero?: boolean
    readonly stdin?: string
    readonly timeout?: Duration.Input
  } = {},
) => runCommand(operation, "gh", args, cwd, options)
