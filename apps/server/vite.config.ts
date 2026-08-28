import { defineConfig } from "vite-plus"

import { isExternalServerDependency, shouldBundleServerDependency } from "./src/pack-deps.ts"

export default defineConfig({
  pack: {
    entry: ["src/main.ts"],
    outDir: "dist",
    sourcemap: true,
    clean: true,
    deps: {
      alwaysBundle: shouldBundleServerDependency,
      neverBundle: isExternalServerDependency,
      onlyBundle: false,
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
