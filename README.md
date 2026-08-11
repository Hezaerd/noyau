# noyau

Monorepo TypeScript du LifeOS Noyau. Voir [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) pour la
vision, les décisions d'architecture et l'ordre de construction.

## Prérequis

- [Bun](https://bun.com) (package manager et runtime)

## Installation

```bash
bun install
```

## Scripts

| Commande               | Effet                                    |
| ---------------------- | ---------------------------------------- |
| `bun run lint`         | Oxlint sur tout le repo                  |
| `bun run lint:fix`     | Oxlint avec corrections automatiques     |
| `bun run format`       | Oxfmt en écriture                        |
| `bun run format:check` | Oxfmt en vérification                    |
| `bun run typecheck`    | `turbo run typecheck` sur les workspaces |
| `bun run build`        | `turbo run build` sur les workspaces     |
| `bun run test`         | `turbo run test` sur les workspaces      |
| `bun run check`        | format:check + lint + typecheck          |

## Structure

Les workspaces vivent dans `apps/*` et `packages/*`. Aucun n'existe encore : on en ajoute un
lorsqu'une frontière est réelle et testée.
