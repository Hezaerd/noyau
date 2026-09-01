import * as NodeServices from "@effect/platform-node/NodeServices"
import { assert, layer } from "@effect/vitest"
import { runCommand } from "@noyau/server/git/run-command"
import { Effect } from "effect"
import { TestClock } from "effect/testing"

layer(NodeServices.layer)("Git command execution", (it) => {
  it.effect("turns a hung child process into a domain failure", () =>
    TestClock.withLive(
      Effect.gen(function* () {
        const error = yield* runCommand(
          "test.timeout",
          process.execPath,
          ["-e", "setTimeout(() => undefined, 5000)"],
          process.cwd(),
          { timeout: "100 millis" },
        ).pipe(Effect.flip)
        assert.strictEqual(error.operation, "test.timeout")
        assert.strictEqual(error.detail, `${process.execPath} timed out`)
      }),
    ),
  )
})
