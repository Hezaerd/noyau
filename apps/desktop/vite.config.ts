import { defineConfig } from "vite-plus"

import { desktopPackNeverBundle, isDesktopAlwaysBundled } from "./scripts/desktop-pack-deps.ts"

const desktopPackDeps = {
  // Effect / @noyau dans l'artefact : le .app packagé n'embarque pas node_modules.
  alwaysBundle: isDesktopAlwaysBundled,
  neverBundle: [...desktopPackNeverBundle],
}

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
      "package:mac": {
        command: "node scripts/package-desktop.ts --mac --dir --skip-build",
        dependsOn: ["build"],
        cache: false,
      },
      "package:mac:dmg": {
        command: "node scripts/package-desktop.ts --mac --dmg --skip-build",
        dependsOn: ["build"],
        cache: false,
      },
      "package:win": {
        command: "node scripts/package-desktop.ts --win --dir --skip-build",
        dependsOn: ["build"],
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
      deps: desktopPackDeps,
    },
    {
      entry: ["src/preload.ts"],
      format: "cjs",
      outDir: "dist-electron",
      outExtensions: () => ({ js: ".cjs" }),
      sourcemap: true,
      deps: desktopPackDeps,
    },
  ],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
  },
})
