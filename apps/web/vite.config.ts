import { fileURLToPath, URL } from "node:url"

import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, lazyPlugins } from "vite-plus"

export default defineConfig({
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
})
