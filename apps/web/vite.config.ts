import { appendFileSync } from "node:fs"
import { fileURLToPath, URL } from "node:url"

import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, lazyPlugins, type Plugin } from "vite-plus"

const agentDebugPlugin = {
  name: "agent-debug-log",
  apply: "serve",
  configureServer(server) {
    server.middlewares.use("/__agent-debug", (request, response, next) => {
      if (request.method !== "POST") {
        next()
        return
      }
      let body = ""
      request.setEncoding("utf8")
      request.on("data", (chunk) => {
        body += chunk
      })
      request.on("end", () => {
        // #region agent log
        appendFileSync("/opt/cursor/logs/debug.log", `${body}\n`)
        // #endregion
        response.statusCode = 204
        response.end()
      })
    })
  },
} satisfies Plugin

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
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
      agentDebugPlugin,
    ]) ?? [],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
      "/health": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
    },
  },
})
