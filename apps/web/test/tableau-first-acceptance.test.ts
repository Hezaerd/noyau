import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vite-plus/test"

const sourcePath = (path: string): string => fileURLToPath(new URL(path, import.meta.url))

describe("Tableau-first UI acceptance", () => {
  it("has no Channel or Message route/page and does not hardcode a project id", () => {
    expect(existsSync(sourcePath("../src/pages/ChannelPage.tsx"))).toBe(false)
    expect(existsSync(sourcePath("../src/routes/projects.noyau.channel.tsx"))).toBe(false)
    expect(readFileSync(sourcePath("../src/lib/control-plane-config.ts"), "utf8")).not.toContain(
      "VITE_NOYAU_PROJECT_ID",
    )
  })
})
