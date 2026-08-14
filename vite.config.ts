import { recommended as effectRecommended } from "@effect/tsgo/oxlint-presets"
import { defineConfig } from "vite-plus"

// `repos/**` est le subtree Effect en lecture seule : jamais formaté, jamais linté.
// `.agents/**` regroupe des skills importés — hors périmètre lint/fmt Noyau.
// `tools/oxlint/anti-slop/**` : plugin Oxlint vendored (anti-slop).
const agentIgnorePatterns = [
  ".agent/**",
  ".agents/**",
  ".claude/**",
  ".codex/**",
  ".continue/**",
  ".cursor/**",
  ".gemini/**",
  ".opencode/**",
  ".pi/**",
  ".roo/**",
  ".windsurf/**",
]
const ignorePatterns = [
  "**/dist/**",
  "**/coverage/**",
  "**/routeTree.gen.ts",
  "repos/**",
  "tools/oxlint/anti-slop/**",
  ...agentIgnorePatterns,
]

type AntiSlopRule = "error" | ["error", { allowInTypeGuards: true }]

const antiSlopRules = {
  "anti-slop/no-chained-type-assertions": "error",
  "anti-slop/no-conditional-empty-object-spread": "error",
  "anti-slop/no-known-value-widening": "error",
  "anti-slop/no-module-mocking": "error",
  "anti-slop/no-object-parameters": "error",
  "anti-slop/no-reflect-apply": "error",
  "anti-slop/no-reflect-get": "error",
  "anti-slop/no-runtime-typeof": ["error", { allowInTypeGuards: true }],
  "anti-slop/no-shape-in-symbol-names": "error",
  "anti-slop/no-unknown-parameters": "error",
  "anti-slop/no-unknown-returns": "error",
  "anti-slop/no-unknown-type-aliases": "error",
  "anti-slop/no-unsafe-dictionary-type": "error",
  "anti-slop/no-widen-then-assert": "error",
  "anti-slop/require-safety-comment-for-type-assertion": "error",
} satisfies Record<string, AntiSlopRule>

export default defineConfig({
  test: {
    projects: ["apps/server", "apps/web", "packages/*"],
  },
  staged: {
    "*.{js,ts,tsx,json,md,yml,yaml}": "vp fmt",
  },
  fmt: {
    printWidth: 100,
    semi: false,
    singleQuote: false,
    trailingComma: "all",
    arrowParens: "always",
    sortImports: true,
    ignorePatterns: [...ignorePatterns, "bun.lock", "docs/**"],
  },
  lint: {
    plugins: ["typescript", "unicorn", "oxc", "import", "promise", "effecttsgo"],
    categories: {
      correctness: "error",
      suspicious: "error",
      perf: "error",
    },
    env: {
      builtin: true,
      es2024: true,
    },
    ignorePatterns,
    rules: {
      ...effectRecommended.rules,
      ...antiSlopRules,
      "no-underscore-dangle": ["error", { allow: ["_tag"] }],
      "import/no-cycle": "error",
      "import/no-relative-parent-imports": "error",
      "typescript/consistent-type-imports": "error",
      "typescript/no-explicit-any": "error",
      // Deciders et projectors retournent dans chaque branche d'un switch
      // exhaustif ; la règle réclame un return final inatteignable.
      "typescript/consistent-return": "off",
      "vite-plus/prefer-vite-plus-imports": "error",
    },
    options: {
      typeAware: true,
      typeCheck: true,
    },
    // Un bloc `lint` dans un vite.config.ts de package est ignoré par `vp lint` :
    // la configuration par workspace passe obligatoirement par ces overrides.
    overrides: [
      {
        files: ["apps/web/**"],
        plugins: ["react"],
        rules: {
          "react/rules-of-hooks": "error",
          "react/only-export-components": ["warn", { allowConstantExport: true }],
          // Transform JSX moderne : React n'a pas besoin d'être dans la portée.
          "react/react-in-jsx-scope": "off",
          // Entrée d'application : imports d'effet de bord et remontées vers src/.
          "import/no-unassigned-import": "off",
          "import/no-relative-parent-imports": "off",
        },
      },
      {
        // Les primitives shadcn sont du code généré et régénérable. On conserve le
        // typecheck TypeScript strict, mais pas les règles de style incompatibles
        // avec les sources officielles du registre.
        files: ["**/components/ui/**/*.tsx"],
        plugins: ["react"],
        rules: {
          "no-underscore-dangle": "off",
          "no-shadow": "off",
          "react/jsx-no-constructed-context-values": "off",
          "react/no-array-index-key": "off",
          "react/no-unstable-nested-components": "off",
          "react/only-export-components": "off",
          "typescript/no-explicit-any": "off",
          "typescript/no-unsafe-type-assertion": "off",
          "typescript/restrict-template-expressions": "off",
        },
      },
    ],
    jsPlugins: [
      {
        name: "vite-plus",
        specifier: "vite-plus/oxlint-plugin",
      },
      {
        name: "anti-slop",
        specifier: "./tools/oxlint/anti-slop/index.js",
      },
    ],
  },
})
