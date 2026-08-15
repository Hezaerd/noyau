import { defineConfig } from "vite-plus"

export default defineConfig({
  run: {
    tasks: {
      build: {
        command: "vp pack && bun scripts/copy-renderer.mjs",
        dependsOn: ["@noyau/web#build"],
      },
      dev: {
        command: "bun scripts/dev-electron.mjs",
        cache: false,
      },
    },
  },
  pack: [
    {
      entry: ["src/main.ts"],
      format: "cjs",
      outDir: "dist-electron",
      outExtensions: () => ({ js: ".cjs" }),
      sourcemap: true,
      clean: true,
    },
    {
      entry: ["src/preload.ts"],
      format: "cjs",
      outDir: "dist-electron",
      outExtensions: () => ({ js: ".cjs" }),
      sourcemap: true,
    },
  ],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
})
