import { GitCommandError } from "@noyau/contracts/git"
import { Effect, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"

const collectProcessText = <E>(stream: Stream.Stream<Uint8Array, E>) =>
  Stream.runCollect(stream).pipe(
    Effect.map((chunks) => {
      const total = chunks.reduce((size, part) => size + part.length, 0)
      const bytes = new Uint8Array(total)
      let offset = 0
      for (const part of chunks) {
        bytes.set(part, offset)
        offset += part.length
      }
      return new TextDecoder().decode(bytes)
    }),
  )

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
            detached: false,
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
  const [stdout, stderr, exitCode] = yield* Effect.all(
    [
      collectProcessText(handle.stdout),
      collectProcessText(handle.stderr),
      handle.exitCode.pipe(Effect.map(Number)),
    ],
    { concurrency: "unbounded" },
  ).pipe(
    Effect.mapError(
      (cause) =>
        new GitCommandError({
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
  } = {},
) => runCommand(operation, "git", args, cwd, options)

export const runGh = (
  operation: string,
  cwd: string,
  args: ReadonlyArray<string>,
  options: { readonly allowNonZero?: boolean; readonly stdin?: string } = {},
) => runCommand(operation, "gh", args, cwd, options)
