import { Effect } from "effect"
import { describe, expect, it } from "vite-plus/test"

import { openFilesystemPathOnHost, resolveOpenableFilesystemPath } from "./open-path"

describe("resolveOpenableFilesystemPath", () => {
  it("accepts posix and windows filesystem paths", () => {
    expect(resolveOpenableFilesystemPath("/Users/hezaerd/project/src/greet.py")).toBe(
      "/Users/hezaerd/project/src/greet.py",
    )
    expect(resolveOpenableFilesystemPath("C:\\repo\\src\\index.ts")).toBe("C:\\repo\\src\\index.ts")
    expect(resolveOpenableFilesystemPath("  /tmp/report.ts  ")).toBe("/tmp/report.ts")
  })

  it("unwraps file URLs into filesystem paths", () => {
    expect(resolveOpenableFilesystemPath("file:///Users/hezaerd/project/src/main.ts")).toBe(
      "/Users/hezaerd/project/src/main.ts",
    )
    expect(resolveOpenableFilesystemPath("file:///C:/Users/mike/project/src/main.ts")).toBe(
      "C:/Users/mike/project/src/main.ts",
    )
  })

  it("rejects empty input, web URLs, and script schemes", () => {
    expect(resolveOpenableFilesystemPath("")).toBeNull()
    expect(resolveOpenableFilesystemPath("   ")).toBeNull()
    expect(resolveOpenableFilesystemPath("https://example.com/docs")).toBeNull()
    expect(resolveOpenableFilesystemPath("mailto:dev@example.com")).toBeNull()
    expect(resolveOpenableFilesystemPath("javascript:alert(1)")).toBeNull()
    expect(resolveOpenableFilesystemPath("data:text/plain,hi")).toBeNull()
  })
})

describe("openFilesystemPathOnHost", () => {
  it("opens a resolved path and surfaces host errors", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const opened: string[] = []
        yield* openFilesystemPathOnHost("/tmp/report.ts", (path) => {
          opened.push(path)
          return Promise.resolve("")
        })
        expect(opened).toEqual(["/tmp/report.ts"])

        const denied = yield* Effect.result(
          openFilesystemPathOnHost("https://example.com", () => Promise.resolve("")),
        )
        expect(denied._tag).toBe("Failure")

        const failed = yield* Effect.result(
          openFilesystemPathOnHost("/tmp/missing.ts", () => Promise.resolve("ENOENT")),
        )
        expect(failed._tag).toBe("Failure")
      }),
    ))
})
