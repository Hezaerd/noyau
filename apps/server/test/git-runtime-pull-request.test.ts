import * as NodeServices from "@effect/platform-node/NodeServices"
import { assert, layer } from "@effect/vitest"
import { GitRuntime, makeGitRuntimeLayer } from "@noyau/server/git/git-runtime"
import { Deferred, Effect, Fiber, Layer, Sink, Stream, type Context } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"

interface Completion {
  readonly stdout: string
  readonly stderr: string
  readonly code: number
}

interface FakeProcess {
  readonly command: ChildProcess.StandardCommand
  readonly completion: Deferred.Deferred<Completion>
  killed: boolean
}

const bytes = (text: string) => new TextEncoder().encode(text)

const viewJson = JSON.stringify({
  number: 42,
  title: "Parallel lookup",
  url: "https://github.com/example/repo/pull/42",
  body: "A pull request",
  author: { login: "octocat" },
  state: "OPEN",
  baseRefName: "main",
  headRefName: "feature/parallel",
  createdAt: "2026-09-05T00:00:00Z",
  updatedAt: "2026-09-05T00:01:00Z",
})

const makeHarness = Effect.gen(function* () {
  const bothStarted = yield* Deferred.make<void>()
  const processes: Array<FakeProcess> = []
  const spawner = ChildProcessSpawner.make((command) =>
    Effect.gen(function* () {
      if (!ChildProcess.isStandardCommand(command)) {
        return yield* Effect.die("Expected a standard command")
      }
      const process: FakeProcess = {
        command,
        completion: yield* Deferred.make<Completion>(),
        killed: false,
      }
      processes.push(process)
      if (processes.length === 2) {
        yield* Deferred.succeed(bothStarted, undefined)
      }
      const completion = Deferred.await(process.completion)
      return ChildProcessSpawner.makeHandle({
        pid: ChildProcessSpawner.ProcessId(processes.length),
        stdin: Sink.drain,
        stdout: Stream.fromEffect(completion.pipe(Effect.map((result) => bytes(result.stdout)))),
        stderr: Stream.fromEffect(completion.pipe(Effect.map((result) => bytes(result.stderr)))),
        all: Stream.fromEffect(completion.pipe(Effect.map((result) => bytes(result.stdout)))),
        exitCode: completion.pipe(
          Effect.map((result) => ChildProcessSpawner.ExitCode(result.code)),
        ),
        isRunning: Effect.succeed(true),
        kill: () =>
          Effect.gen(function* () {
            process.killed = true
            yield* Deferred.succeed(process.completion, {
              stdout: "",
              stderr: "",
              code: 137,
            })
          }),
        getInputFd: () => Sink.drain,
        getOutputFd: () => Stream.empty,
        unref: Effect.succeed(Effect.void),
      })
    }),
  )
  const services = Layer.mergeAll(
    NodeServices.layer,
    Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner),
  )
  const context = yield* Layer.build(makeGitRuntimeLayer(services))
  return {
    bothStarted,
    context,
    processes,
  }
})

const request = (context: Context.Context<GitRuntime>) =>
  Effect.gen(function* () {
    const git = yield* GitRuntime
    return yield* git.getPullRequest("/repo", 42)
  }).pipe(Effect.provideContext(context))

const commitRequest = (context: Context.Context<GitRuntime>, commitOid: string) =>
  Effect.gen(function* () {
    const git = yield* GitRuntime
    return yield* git.getPullRequest("/repo", 42, commitOid)
  }).pipe(Effect.provideContext(context))

const processFor = (
  processes: ReadonlyArray<FakeProcess>,
  predicate: (args: ReadonlyArray<string>) => boolean,
) => {
  const process = processes.find(({ command }) => predicate(command.args))
  assert.isDefined(process)
  return process
}

layer(NodeServices.layer)("GitRuntime pull request lookup", (it) => {
  it.effect("starts PR view and full diff concurrently", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness
      const fiber = yield* Effect.forkChild(request(harness.context))
      yield* Deferred.await(harness.bothStarted)

      const viewed = processFor(harness.processes, (args) => args[1] === "view")
      const diff = processFor(harness.processes, (args) => args[1] === "diff")
      assert.deepStrictEqual(viewed.command.args.slice(0, 2), ["pr", "view"])
      assert.deepStrictEqual(diff.command.args, ["pr", "diff", "42"])

      yield* Deferred.succeed(viewed.completion, { stdout: viewJson, stderr: "", code: 0 })
      yield* Deferred.succeed(diff.completion, {
        stdout: "full PR patch",
        stderr: "",
        code: 0,
      })
      const result = yield* Fiber.join(fiber)
      assert.strictEqual(result.patch, "full PR patch")
      assert.strictEqual(result.number, 42)
    }),
  )

  it.effect("uses the commit diff endpoint when a commit is selected", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness
      const commitOid = "a".repeat(40)
      const fiber = yield* Effect.forkChild(commitRequest(harness.context, commitOid))
      yield* Deferred.await(harness.bothStarted)

      const viewed = processFor(harness.processes, (args) => args[1] === "view")
      const diff = processFor(harness.processes, (args) => args[0] === "api")
      assert.deepStrictEqual(diff.command.args, [
        "api",
        "-H",
        "Accept: application/vnd.github.diff",
        `repos/{owner}/{repo}/commits/${commitOid}`,
      ])

      yield* Deferred.succeed(viewed.completion, { stdout: viewJson, stderr: "", code: 0 })
      yield* Deferred.succeed(diff.completion, {
        stdout: "commit patch",
        stderr: "",
        code: 0,
      })
      const result = yield* Fiber.join(fiber)
      assert.strictEqual(result.patch, "commit patch")
    }),
  )

  it.effect("interrupts the sibling lookup when one command fails", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness
      const fiber = yield* Effect.forkChild(request(harness.context))
      yield* Deferred.await(harness.bothStarted)

      const viewed = processFor(harness.processes, (args) => args[1] === "view")
      const diff = processFor(harness.processes, (args) => args[1] === "diff")
      yield* Deferred.succeed(viewed.completion, {
        stdout: "",
        stderr: "view failed",
        code: 1,
      })

      const error = yield* Fiber.join(fiber).pipe(Effect.flip)
      assert.strictEqual(error.operation, "gh.pr.view")
      assert.isTrue(diff.killed)
    }),
  )

  it.effect("interrupts metadata when the full PR diff fails", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness
      const fiber = yield* Effect.forkChild(request(harness.context))
      yield* Deferred.await(harness.bothStarted)

      const viewed = processFor(harness.processes, (args) => args[1] === "view")
      const diff = processFor(harness.processes, (args) => args[1] === "diff")
      yield* Deferred.succeed(diff.completion, {
        stdout: "",
        stderr: "diff failed",
        code: 1,
      })

      const error = yield* Fiber.join(fiber).pipe(Effect.flip)
      assert.strictEqual(error.operation, "gh.pr.diff")
      assert.isTrue(viewed.killed)
    }),
  )
})
