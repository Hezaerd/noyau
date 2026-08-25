import { describe, expect, it } from "vite-plus/test"

import { fileDiffPath, parseTurnDiffPatch } from "../src/lib/turn-diff-patch.ts"

const SAMPLE_PATCH = `diff --git a/src/app.ts b/src/app.ts
index 1111111..2222222 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,2 +1,3 @@
 export const answer = 42
+export const next = 43
`

describe("parseTurnDiffPatch", () => {
  it("extrait les fichiers d'un patch unifié", () => {
    const files = parseTurnDiffPatch(SAMPLE_PATCH)
    expect(files.length).toBeGreaterThan(0)
    expect(files.some((file) => fileDiffPath(file).includes("app.ts"))).toBe(true)
  })

  it("ignore un patch vide", () => {
    expect(parseTurnDiffPatch("")).toEqual([])
    expect(parseTurnDiffPatch("   ")).toEqual([])
  })
})
