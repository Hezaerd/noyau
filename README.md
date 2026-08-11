# noyau

Monorepo TypeScript du LifeOS Noyau. Voir [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) pour la
vision, les décisions d'architecture et l'ordre de construction.

## Prérequis

- [Bun](https://bun.com) (package manager et runtime)

## Installation

```bash
bun install
```

## Effect

Le catalogue Bun épingle Effect v4 sur `4.0.0-beta.107`. Chaque workspace qui utilise Effect le
déclare avec `"effect": "catalog:"` afin de conserver une seule version dans tout le monorepo.
Les versions beta restent épinglées exactement, car elles peuvent introduire des ruptures.

Le language server Effect v4 repose sur `@effect/tsgo` et TypeScript 7. `bun install` applique
automatiquement ses patches TypeScript et Oxlint. Dans Cursor :

1. installer les extensions recommandées par le workspace ;
2. recharger la fenêtre ;
3. vérifier que TypeScript 7 est actif dans un fichier TypeScript.

Les diagnostics Effect sont alors disponibles dans l'éditeur et pendant `bun run typecheck` et
`bun run lint`.

Le code source correspondant à la version du catalogue est vendored sous `repos/effect/` avec un
git subtree. Il sert uniquement de référence aux agents : lire d'abord `repos/effect/LLMS.md`, ne
jamais modifier cette arborescence et ne jamais importer depuis `repos/`.

Pour synchroniser le subtree après avoir mis à jour la version du catalogue :

```bash
git subtree pull \
  --prefix=repos/effect \
  https://github.com/Effect-TS/effect.git \
  effect@4.0.0-beta.107 \
  --squash
```

## Scripts

| Commande               | Effet                                    |
| ---------------------- | ---------------------------------------- |
| `bun run lint`         | Oxlint sur le code Noyau                 |
| `bun run lint:fix`     | Oxlint avec corrections automatiques     |
| `bun run format`       | Oxfmt en écriture                        |
| `bun run format:check` | Oxfmt en vérification                    |
| `bun run typecheck`    | `turbo run typecheck` sur les workspaces |
| `bun run build`        | `turbo run build` sur les workspaces     |
| `bun run test`         | `turbo run test` sur les workspaces      |
| `bun run check`        | format:check + lint + typecheck          |

## Structure

Les workspaces vivent dans `apps/*` et `packages/*`. On en ajoute un seulement lorsqu'une frontière
est réelle et testée.
