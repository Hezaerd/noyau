import { Effect, Schema } from "effect"
import { ChildProcess } from "effect/unstable/process"

import { scriptRuntime } from "./runtime.ts"

export class AdhocSignMacError extends Schema.TaggedError<AdhocSignMacError>()(
  "AdhocSignMacError",
  {
    message: Schema.String,
  },
) {}

export interface AdhocSignMacArgs {
  readonly app: string
}

const fail = (message: string): never => {
  throw new AdhocSignMacError({ message })
}

export const shouldAdhocSignMac = (electronPlatformName: string): boolean =>
  electronPlatformName === "darwin"

export const resolveMacAppBundlePath = (appOutDir: string, productFilename: string): string => {
  if (appOutDir === "" || productFilename === "") {
    return fail("afterPack appOutDir and productFilename are required")
  }
  return `${appOutDir.replaceAll(/\/+$/g, "")}/${productFilename}.app`
}

export const adhocSignMacArgs = (appBundlePath: string): ReadonlyArray<string> => [
  "--force",
  "--deep",
  "--sign",
  "-",
  appBundlePath,
]

export const verifyMacAppArgs = (appBundlePath: string): ReadonlyArray<string> => [
  "--verify",
  "--deep",
  "--strict",
  appBundlePath,
]

export const parseAdhocSignMacArgs = (argv: ReadonlyArray<string>): AdhocSignMacArgs => {
  const values = new Map<string, string>()
  const unknown: Array<string> = []

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === undefined) {
      continue
    }
    if (arg === "--app") {
      const value = argv[index + 1]
      if (value === undefined || value.startsWith("--")) {
        return fail("--app requires a value")
      }
      values.set(arg, value)
      index += 1
      continue
    }
    unknown.push(arg)
  }

  if (unknown.length > 0) {
    return fail(`Unknown adhoc-sign flag(s): ${unknown.join(", ")}`)
  }

  const app = values.get("--app")
  if (app === undefined || app === "") {
    return fail("--app requires a value")
  }
  return { app }
}

const runCodesign = Effect.fn("runCodesign")(function* (args: ReadonlyArray<string>) {
  const handle = yield* ChildProcess.make("codesign", args, {
    detached: false,
    stdin: "ignore",
    stdout: "inherit",
    stderr: "inherit",
  })
  const code = yield* handle.exitCode.pipe(Effect.orElseSucceed(() => 1))
  if (Number(code) !== 0) {
    return yield* new AdhocSignMacError({
      message: `codesign ${args.join(" ")} exited with ${String(code)}`,
    })
  }
})

export const adhocSignMacApp = Effect.fn("adhocSignMacApp")(function* (appBundlePath: string) {
  yield* runCodesign(adhocSignMacArgs(appBundlePath))
  yield* runCodesign(verifyMacAppArgs(appBundlePath))
})

const isCli = (process.argv[1] ?? "").replaceAll("\\", "/").endsWith("/adhoc-sign-mac.ts")

if (isCli) {
  void scriptRuntime
    .runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { app } = parseAdhocSignMacArgs(process.argv.slice(2))
          yield* adhocSignMacApp(app)
        }),
      ),
    )
    .catch((cause: unknown) => {
      process.stderr.write(`Failed to ad-hoc sign macOS app: ${String(cause)}\n`)
      process.exit(1)
    })
}
