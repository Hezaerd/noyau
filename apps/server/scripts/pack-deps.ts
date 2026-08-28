import { isBuiltin } from "node:module"

/**
 * Paquets que le sidecar ne peut pas inliner : addons `.node` et leurs
 * chargeurs. Vide aujourd'hui — `fractional-indexing` et le SDK Claude sont
 * du JS. Le `.app` n'embarque pas `node_modules` ; tout le reste doit entrer
 * dans `dist/main.mjs`.
 *
 * `alwaysBundle` force l'inclusion. Un `false` n'est pas « externe », c'est
 * « sans avis » : une dep transitive se fait alors inliner. Brancher aussi
 * `neverBundle` sur `isExternalServerDependency`.
 */
export const SERVER_NATIVE_EXTERNAL_PREFIXES = [] as const

const BARE_FROM_SPECIFIER = /(?:^|\n)\s*(?:import|export)\s[\s\S]*?\sfrom\s*["']([^"']+)["']/g
const BARE_SIDE_EFFECT_IMPORT = /(?:^|\n)\s*import\s*["']([^"']+)["']/g
const BARE_DYNAMIC_IMPORT = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g

export const isNodeBuiltinSpecifier = (id: string): boolean =>
  id.startsWith("node:") || isBuiltin(id)

export const isNativeExternalServerDependency = (id: string): boolean =>
  SERVER_NATIVE_EXTERNAL_PREFIXES.some((prefix) => id.startsWith(prefix))

export const isExternalServerDependency = (id: string): boolean =>
  isNodeBuiltinSpecifier(id) || isNativeExternalServerDependency(id)

/** True when the server pack should inline `id` rather than leave it external. */
export const shouldBundleServerDependency = (id: string): boolean => !isExternalServerDependency(id)

const collectSpecifier = (id: string, found: Set<string>): void => {
  if (id.startsWith(".") || id.startsWith("/") || isExternalServerDependency(id)) {
    return
  }
  found.add(id)
}

/** Bare npm specifiers still present in an emitted ESM chunk. */
export const findBareRuntimeImports = (source: string): ReadonlyArray<string> => {
  const found = new Set<string>()
  for (const pattern of [BARE_FROM_SPECIFIER, BARE_SIDE_EFFECT_IMPORT, BARE_DYNAMIC_IMPORT]) {
    pattern.lastIndex = 0
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1]
      if (specifier !== undefined) {
        collectSpecifier(specifier, found)
      }
    }
  }
  return [...found].sort()
}
