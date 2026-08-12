# noyau

Monorepo TypeScript du LifeOS Noyau. Voir [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) pour la
vision, les décisions d'architecture et l'ordre de construction.

## Prérequis

- [Bun](https://bun.com) (package manager et runtime applicatif)
- Docker (PostgreSQL local et tests d'intégration Testcontainers)
- [Vite+](https://viteplus.dev) pour la CLI `vp` globale — optionnel mais recommandé :

```bash
curl -fsSL https://vite.plus | bash
```

Sans installation globale, `bun install` fonctionne quand même : le paquet local `vite-plus`
expose un `vp` dans `node_modules/.bin`. Les commandes ci-dessous s'écrivent alors `bun run vp …`.

## Installation

```bash
bun install
```

## Toolchain

La toolchain frontend est fournie par un paquet unique, `vite-plus`, qui épingle ensemble Vite,
Rolldown, Vitest, Oxlint, Oxfmt, tsdown et Vite Task. Le catalogue Bun aliase `vite` vers
`@voidzero-dev/vite-plus-core`, et `overrides` force tout le graphe de dépendances à résoudre ce
Vite et ce Vitest : aucune seconde copie ne peut apparaître.

Toute la configuration vit dans [`vite.config.ts`](vite.config.ts) à la racine — blocs `fmt`,
`lint`, `test`, `staged` — plus un `vite.config.ts` par workspace pour ce qui est propre à Vite
ou à Vitest. La configuration de lint par workspace passe obligatoirement par `lint.overrides`
à la racine : un bloc `lint` posé dans le `vite.config.ts` d'un package est ignoré.

Les hooks Git passent par Vite+ (`.vite-hooks/`) : le pre-commit formate les fichiers stagés
(`vp staged`), le commit-msg valide Conventional Commits (`commitlint`). Pour activer le
dispatcher dans un clone :

```bash
vp hooks enable
```

Node est provisionné par `vp` à la version de [`.node-version`](.node-version) ; Bun reste le
package manager, à la version du champ `packageManager`.

## Control plane local

```bash
docker compose -f infra/compose/docker-compose.yml up -d postgres
NOYAU_ENV=development \
DATABASE_URL=postgresql://noyau:noyau@localhost:5432/noyau \
bun run dev:control-plane
```

L'API écoute par défaut sur `http://127.0.0.1:3001`. Les routes projet exigent
`X-Noyau-Actor-Id` en développement ; la documentation Scalar est servie sur `/docs`.

## Effect

Le catalogue Bun épingle Effect v4 sur `4.0.0-beta.107`. Chaque workspace qui utilise Effect le
déclare avec `"effect": "catalog:"` afin de conserver une seule version dans tout le monorepo.
Les versions beta restent épinglées exactement, car elles peuvent introduire des ruptures.

Le language server Effect v4 repose sur `@effect/tsgo` et TypeScript 7. `bun install` applique
automatiquement ses patches TypeScript et Oxlint. Dans Cursor :

1. installer les extensions recommandées par le workspace ;
2. recharger la fenêtre ;
3. vérifier que TypeScript 7 est actif dans un fichier TypeScript.

Les diagnostics Effect sont disponibles dans l'éditeur, et appliqués en terminal par
`bun run lint` : le preset `recommended` de `@effect/tsgo` est branché sur le bloc `lint` de
`vite.config.ts`, et `@effect/tsgo` patche l'Oxlint fourni par `vite-plus`. Ce montage dépend
d'un accord de versions exact — `vite-plus` doit fournir l'Oxlint et l'`oxlint-tsgolint` que
`@effect/tsgo` supporte. Vérifier `vp toolchain` contre les exigences de `@effect/tsgo` avant
tout bump de `vite-plus`.

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

| Commande                    | Effet                                                         |
| --------------------------- | ------------------------------------------------------------- |
| `bun run check`             | `vp check` (format + lint type-aware + type check) puis `tsc` |
| `bun run lint`              | Oxlint type-aware, règles Effect incluses                     |
| `bun run lint:fix`          | idem avec corrections automatiques                            |
| `bun run format`            | Oxfmt en écriture                                             |
| `bun run format:check`      | Oxfmt en vérification                                         |
| `bun run typecheck`         | `tsc` par workspace, ordonné et caché par Vite Task           |
| `bun run test`              | Vitest par workspace, caché par Vite Task                     |
| `bun run build`             | build par workspace, caché par Vite Task                      |
| `bun run dev:control-plane` | API locale avec rechargement Bun                              |
| `bun run dev:web`           | serveur de dev de `apps/web`                                  |

Les tâches passent par Vite Task (`vp run`), qui remplace Turborepo. Il n'y a pas d'`inputs` ni
d'`outputs` à déclarer : le suivi automatique observe les fichiers réellement lus et écrits par
chaque tâche. `vp run --last-details` explique chaque hit et chaque miss, `vp cache clean` vide le
cache.

Deux commandes Vite+ existent aussi hors scripts : `vp check --fix` pour la boucle de dev, et
`vp test watch` pour les tests en watch (`vp test` seul ne watch pas).

## Structure

Les workspaces vivent dans `apps/*` et `packages/*`. On en ajoute un seulement lorsqu'une frontière
est réelle et testée.
