import { defineConfig } from "vite-plus"

export default defineConfig({
  pack: {
    entry: ["src/main.ts"],
    outDir: "dist",
    sourcemap: true,
    clean: true,
    deps: {
      alwaysBundle: (id: string) =>
        id.startsWith("@noyau/") ||
        id === "effect" ||
        id.startsWith("@effect/") ||
        id.startsWith("effect/"),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
