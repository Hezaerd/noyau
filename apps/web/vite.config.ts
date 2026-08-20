import { fileURLToPath, URL } from "node:url"

import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, lazyPlugins } from "vite-plus"

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
      tailwindcss(),
    ]) ?? [],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    hmr: {
      protocol: "ws",
      host: "127.0.0.1",
      clientPort: 5173,
    },
    proxy: {
      "/rpc": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
        ws: true,
      },
      "/health": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
    },
  },
})
