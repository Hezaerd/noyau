export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Scopes alignés sur les workspaces et la CI du monorepo ; optionnel.
    "scope-enum": [
      2,
      "always",
      [
        "tooling",
        "server",
        "web",
        "domain",
        "protocol",
        "database",
        "client-runtime",
        "ci",
        "github",
      ],
    ],
    "scope-empty": [0, "never"],
  },
}
