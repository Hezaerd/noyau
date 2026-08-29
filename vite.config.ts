import { recommended as effectRecommended } from "@effect/tsgo/oxlint-presets"
import { defineConfig } from "vite-plus"

// `repos/**` regroupe les subtrees vendored (Effect, …) : jamais formatés, jamais lintés.
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
  "**/dist-electron/**",
  "**/release/**",
  "**/coverage/**",
  "**/routeTree.gen.ts",
  ".worktrees/**",
  "repos/**",
  "tools/oxlint/anti-slop/**",
  ...agentIgnorePatterns,
]
// Codegen ACP : hors lint (anti-slop / type-aware sur ~10k lignes), mais dans fmt
// pour que `vp run generate` puisse formater après écriture.
const generatedAcpIgnore = "packages/acp/src/_generated/**"
const generatedCodexIgnore = "packages/codex/src/_generated/**"
// Copie embarquée et déterministe du skill canonique. Le générateur compare le
// fichier octet pour octet afin de ne pas invalider le cache Vite Task.
const generatedAgentSkillIgnore = "apps/server/src/agent-skill/generated.ts"

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
    projects: ["apps/desktop", "apps/server", "apps/web", "packages/*"],
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
    ignorePatterns: [
      ...ignorePatterns,
      generatedAgentSkillIgnore,
      generatedCodexIgnore,
      "bun.lock",
      "docs/**",
    ],
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
    ignorePatterns: [...ignorePatterns, generatedAcpIgnore, generatedCodexIgnore],
    rules: {
      ...effectRecommended.rules,
      ...antiSlopRules,
      "no-underscore-dangle": ["error", { allow: ["_tag", "_meta"] }],
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
        // Fil de fer ACP : codegen + JSON-RPC stdio calqué sur t3code. Les règles
        // anti-slop et les imports `_internal` ne s'appliquent pas à cette frontière.
        files: ["packages/acp/**"],
        rules: {
          "import/no-relative-parent-imports": "off",
          "no-shadow": "off",
          "unicorn/consistent-function-scoping": "off",
          "typescript/no-unsafe-type-assertion": "off",
          "effecttsgo/strict-effect-provide": "off",
          "anti-slop/no-object-parameters": "off",
          "anti-slop/no-unknown-parameters": "off",
          "anti-slop/no-unknown-returns": "off",
          "anti-slop/no-runtime-typeof": "off",
          "anti-slop/no-conditional-empty-object-spread": "off",
          "anti-slop/require-safety-comment-for-type-assertion": "off",
          "anti-slop/no-unsafe-dictionary-type": "off",
          "anti-slop/no-known-value-widening": "off",
        },
      },
      {
        // Fil de fer Codex app-server : codegen + JSON-RPC stdio calqué sur t3code.
        files: ["packages/codex/**"],
        rules: {
          "import/no-relative-parent-imports": "off",
          "no-shadow": "off",
          "unicorn/consistent-function-scoping": "off",
          "typescript/no-unsafe-type-assertion": "off",
          "effecttsgo/strict-effect-provide": "off",
          "anti-slop/no-object-parameters": "off",
          "anti-slop/no-unknown-parameters": "off",
          "anti-slop/no-unknown-returns": "off",
          "anti-slop/no-runtime-typeof": "off",
          "anti-slop/no-conditional-empty-object-spread": "off",
          "anti-slop/require-safety-comment-for-type-assertion": "off",
          "anti-slop/no-unsafe-dictionary-type": "off",
          "anti-slop/no-known-value-widening": "off",
          "anti-slop/no-shape-in-symbol-names": "off",
        },
      },
      {
        // Adaptateur Codex : le fil de fer embarque Schema.Defect (unknown) dans E.
        // Les appels sont ramenés à CodexAdapterFailure avant de quitter l'adaptateur.
        files: ["apps/server/src/provider/codex-app-server.ts"],
        rules: {
          "effecttsgo/any-unknown-in-error-context": "off",
        },
      },
      {
        // Frontière Schema des frames Claude SDK : decodeUnknownOption prend
        // unknown / Record<string, unknown> par contrat.
        files: ["apps/server/src/provider/claude-sdk-messages.ts"],
        rules: {
          "anti-slop/no-unknown-parameters": "off",
          "anti-slop/no-unsafe-dictionary-type": "off",
        },
      },
      {
        // Adaptateur Claude : Options SDK (cwd + model + effort + resume) et
        // assertion unique vers MessageParam. Les frames passent par Schema.
        files: ["apps/server/src/provider/claude-agent.ts"],
        rules: {
          "anti-slop/no-object-parameters": "off",
          "anti-slop/no-conditional-empty-object-spread": "off",
          "anti-slop/require-safety-comment-for-type-assertion": "off",
          "typescript/no-unsafe-type-assertion": "off",
        },
      },
      {
        // Fakes SDK : frames partielles (SAFETY) et iterator Promise.
        files: ["apps/server/test/claude-agent.test.ts"],
        rules: {
          "anti-slop/no-object-parameters": "off",
          "anti-slop/no-chained-type-assertions": "off",
          "anti-slop/require-safety-comment-for-type-assertion": "off",
          "typescript/no-unsafe-type-assertion": "off",
        },
      },
      {
        // Ghostty WASM ABI, ported from t3code. The trampoline and layout
        // walks are a foreign C boundary; anti-slop and object bags do not apply.
        files: ["apps/web/src/terminal/ghostty/**"],
        rules: {
          "anti-slop/no-object-parameters": "off",
          "anti-slop/no-unknown-parameters": "off",
          "anti-slop/no-unknown-returns": "off",
          "anti-slop/no-runtime-typeof": "off",
          "anti-slop/no-conditional-empty-object-spread": "off",
          "anti-slop/require-safety-comment-for-type-assertion": "off",
          "anti-slop/no-unsafe-dictionary-type": "off",
          "anti-slop/no-known-value-widening": "off",
          "typescript/no-unsafe-type-assertion": "off",
          "typescript/consistent-type-imports": "off",
          "typescript/no-misused-spread": "off",
          "unicorn/consistent-function-scoping": "off",
          "unicorn/no-new-array": "off",
          "promise/always-return": "off",
          "no-underscore-dangle": "off",
          "effecttsgo/global-console": "off",
          "effecttsgo/global-fetch": "off",
        },
      },
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
          // Renderer : pas d'Effect dans l'état local, le DOM ou les tests RTL.
          "effecttsgo/async-function": "off",
          "effecttsgo/global-date": "off",
          "effecttsgo/global-timers": "off",
        },
      },
      {
        // Hooks Electron / pack : stdlib Node, pas de runtime Effect.
        files: ["apps/desktop/scripts/**"],
        rules: {
          "effecttsgo/node-builtin-import": "off",
          "effecttsgo/async-function": "off",
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
          "anti-slop/require-safety-comment-for-type-assertion": "off",
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
