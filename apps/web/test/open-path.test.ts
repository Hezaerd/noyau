// @vitest-environment happy-dom

import { Effect } from "effect"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import { openFilesystemPath, openFilesystemPathEffect } from "../src/lib/open-path"

afterEach(() => {
  Object.defineProperty(window, "noyauDesktop", {
    configurable: true,
    value: undefined,
  })
  vi.restoreAllMocks()
})

describe("openFilesystemPath", () => {
  it("invokes the Desktop bridge", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const openPath = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(window, "noyauDesktop", {
          configurable: true,
          value: { openPath },
        })

        yield* Effect.promise(() => openFilesystemPath("/Users/hezaerd/project/src/greet.py"))
        expect(openPath).toHaveBeenCalledWith("/Users/hezaerd/project/src/greet.py")
      }),
    ))

  it("fails when the Desktop bridge is missing", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const result = yield* Effect.result(openFilesystemPathEffect("/tmp/report.ts"))
        expect(result._tag).toBe("Failure")
      }),
    ))
})
