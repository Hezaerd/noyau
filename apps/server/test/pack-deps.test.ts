import { describe, expect, it } from "@effect/vitest"
import {
  findBareRuntimeImports,
  isExternalServerDependency,
  SERVER_NATIVE_EXTERNAL_PREFIXES,
  shouldBundleServerDependency,
} from "@noyau/server/pack-deps"

describe("server pack deps", () => {
  it("inlines ordinary JS runtime dependencies", () => {
    for (const id of [
      "fractional-indexing",
      "@anthropic-ai/claude-agent-sdk",
      "effect",
      "@effect/platform-node",
      "@noyau/contracts",
    ]) {
      expect(shouldBundleServerDependency(id)).toBe(true)
    }
  })

  it("leaves Node builtins external", () => {
    for (const id of ["node:fs", "node:module", "fs", "module", "path"]) {
      expect(isExternalServerDependency(id)).toBe(true)
      expect(shouldBundleServerDependency(id)).toBe(false)
    }
  })

  it("has no native exemption until a .node addon needs the filesystem", () => {
    expect(SERVER_NATIVE_EXTERNAL_PREFIXES).toEqual([])
  })
})

describe("findBareRuntimeImports", () => {
  it("reports leftover npm specifiers that Node would resolve from disk", () => {
    const source = `
import { generateKeyBetween } from "fractional-indexing";
import { query } from "@anthropic-ai/claude-agent-sdk";
import * as Fs from "node:fs";
import { createRequire } from "module";
import { local } from "./local.ts";
`
    expect(findBareRuntimeImports(source)).toEqual([
      "@anthropic-ai/claude-agent-sdk",
      "fractional-indexing",
    ])
  })

  it("reports side-effect and dynamic leftover imports", () => {
    const source = `
import "fractional-indexing";
const sdk = await import("@anthropic-ai/claude-agent-sdk");
`
    expect(findBareRuntimeImports(source)).toEqual([
      "@anthropic-ai/claude-agent-sdk",
      "fractional-indexing",
    ])
  })

  it("treats a self-contained sidecar chunk as clean", () => {
    const source = `
import { createRequire } from "node:module";
import * as Path from "node:path";
import { createRequire as createRequire$1 } from "module";
`
    expect(findBareRuntimeImports(source)).toEqual([])
  })

  it("ignores JSDoc and string examples that mention npm specifiers", () => {
    const source = `
/**
 * import { Pipeable } from "effect"
 * \`\`\`ts import.meta.vitest
 * import { TestClock } from "effect/testing"
 */
const docs = \`import { query } from "@anthropic-ai/claude-agent-sdk"\`
`
    expect(findBareRuntimeImports(source)).toEqual([])
  })
})
