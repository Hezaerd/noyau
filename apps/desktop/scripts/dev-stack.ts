import { Effect } from "effect"

import { runDevRunner } from "./dev-runner.ts"
import { restoreTty } from "./restore-tty.ts"
import { scriptRuntime } from "./runtime.ts"

void scriptRuntime
  .runPromise(
    Effect.scoped(
      runDevRunner({
        mode: "dev",
        homeDir: undefined,
        port: undefined,
        dryRun: false,
      }),
    ),
  )
  .finally(() => {
    restoreTty()
  })
