import { defineConfig } from "vite-plus"

// `repos/**` est le subtree Effect en lecture seule : jamais formaté, jamais linté.
const ignorePatterns = [
  "**/dist/**",
  "**/.turbo/**",
  "**/coverage/**",
  "**/routeTree.gen.ts",
  "repos/**",
]

export default defineConfig({
  test: {
    projects: ["packages/*"],
  },
  staged: {
    "*": "vp fmt",
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
    plugins: ["typescript", "unicorn", "oxc", "import", "promise"],
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
      "no-underscore-dangle": ["error", { allow: ["_tag"] }],
      "import/no-cycle": "error",
      "import/no-relative-parent-imports": "error",
      "typescript/consistent-type-imports": "error",
      "typescript/no-explicit-any": "error",
      "vite-plus/prefer-vite-plus-imports": "error",
    },
    options: {
      typeAware: false,
      typeCheck: false,
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
    ],
    jsPlugins: [
      {
        name: "vite-plus",
        specifier: "vite-plus/oxlint-plugin",
      },
    ],
  },
})
