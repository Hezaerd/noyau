import { describe, expect, it } from "@effect/vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const protocolRoot = resolve(import.meta.dirname, "..")
const packageJson = JSON.parse(readFileSync(resolve(protocolRoot, "package.json"), "utf8")) as {
  readonly exports: Record<string, string>
}

describe("protocol exports", () => {
  it("n'exporte aucun barrel ni les formes mortes v1", () => {
    const exports = Object.keys(packageJson.exports)
    expect(exports).not.toContain(".")
    expect(exports).not.toContain("./entities/channel")
    expect(exports).not.toContain("./entities/message")
    expect(exports).not.toContain("./entities/repository")
  })

  it("ne mentionne plus Channel, Message, sourceThreadId ni EventCursor", () => {
    const sources = Object.values(packageJson.exports).map((relative) =>
      readFileSync(resolve(protocolRoot, relative), "utf8"),
    )
    const joined = sources.join("\n")

    expect(joined).not.toMatch(/\bChannel\b/)
    expect(joined).not.toMatch(/\bChannelId\b/)
    expect(joined).not.toMatch(/\bMessage\b/)
    expect(joined).not.toMatch(/\bMessageId\b/)
    expect(joined).not.toMatch(/\bsourceThreadId\b/)
    expect(joined).not.toMatch(/\bEventCursor\b/)
    expect(joined).not.toMatch(/\bpermissionMode\b/)
  })
})
