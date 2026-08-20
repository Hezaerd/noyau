import { defineConfig } from "vite-plus"

export default defineConfig({
  run: {
    tasks: {
      build: {
        command: "vp pack && node scripts/copy-renderer.ts && node scripts/copy-server.ts",
        dependsOn: ["@noyau/server#build", "@noyau/web#build"],
        // Cette séquence assemble un même dist-electron : `vp pack` le nettoie avant
        // que les deux copies le repeuplent. Le cache indépendant des commandes `&&`
        // peut rejouer les copies après le nettoyage sans restaurer leurs fichiers.
        cache: false,
      },
      dev: {
        command: "vp pack --watch",
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
      deps: {
        alwaysBundle: (id: string) => id === "@noyau/protocol" || id.startsWith("@noyau/protocol/"),
      },
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
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
  },
})
