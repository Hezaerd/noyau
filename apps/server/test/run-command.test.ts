import * as NodeServices from "@effect/platform-node/NodeServices"
import { assert, layer } from "@effect/vitest"
import { runCommand } from "@noyau/server/git/run-command"
import { Effect } from "effect"
import { TestClock } from "effect/testing"

layer(NodeServices.layer)("Git command execution", (it) => {
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
