import { fileURLToPath, URL } from "node:url"

import { BASE_SERVER_PORT, BASE_WEB_PORT, readDevPort } from "@noyau/shared/dev-ports"
import babel from "@rolldown/plugin-babel"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react, { reactCompilerPreset } from "@vitejs/plugin-react"
import { defineConfig, lazyPlugins } from "vite-plus"

const webPort = readDevPort(process.env.PORT, BASE_WEB_PORT)
const serverPort = readDevPort(process.env.NOYAU_PORT, BASE_SERVER_PORT)

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.{ts,tsx}"],
  },
  run: {
    tasks: {
      // Déclaré en tâche plutôt qu'en script : `tsc -b` lit et réécrit son
      // tsbuildinfo, que le suivi automatique compte alors comme un input
      // modifié, ce qui rend la tâche non cachable. L'exclure suffit.
      typecheck: {
        command: "tsc -b",
        input: [{ auto: true }, "!**/*.tsbuildinfo"],
      },
      build: {
        command: "vp build",
        dependsOn: ["typecheck"],
      },
    },
  },
  // `lazyPlugins` évite de charger les plugins quand vite-plus ne lit que les
  // blocs de métadonnées (lint, fmt, check, staged). Le `?? []` est requis par
  // `exactOptionalPropertyTypes`, la signature renvoyant `PluginOption[] | undefined`.
  plugins:
    lazyPlugins(() => [
      tanstackRouter({ target: "react", autoCodeSplitting: true }),
      react(),
      babel({
        // plugin-react v6 ne parse TS/JSX que sur des globs relatifs au CWD.
        // Les packages workspace (chemins hors apps/web) cassent sans ça.
        parserOpts: { plugins: ["typescript", "jsx"] },
        presets: [reactCompilerPreset()],
      }),
      tailwindcss(),
    ]) ?? [],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  optimizeDeps: {
    include: ["@pierre/diffs", "@pierre/diffs/react"],
  },
  server: {
    host: "127.0.0.1",
    port: webPort,
    strictPort: true,
    hmr: {
      protocol: "ws",
      host: "127.0.0.1",
      clientPort: webPort,
    },
    proxy: {
      "/rpc": {
        target: `http://127.0.0.1:${String(serverPort)}`,
        changeOrigin: true,
        ws: true,
      },
      "/health": {
        target: `http://127.0.0.1:${String(serverPort)}`,
        changeOrigin: true,
      },
    },
  },
})
