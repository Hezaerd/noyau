# noyau

Monorepo TypeScript du LifeOS Noyau. Voir [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) pour la
vision, les décisions d'architecture et l'ordre de construction.

## Modèle produit

Noyau v0.1 est un Environment desktop local : un Tableau Kanban par Project, des Threads Cursor
(`Project → Thread → Turn`) et un lien optionnel `TicketThread`. Voir
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) et [l'ADR-0011](docs/adr/0011-noyau-local-first-v0.1.md).

## Prérequis

- [Bun](https://bun.com) (package manager et runtime applicatif)
- Docker (uniquement si tu touches encore l'ancien store Postgres — la cible v0.1 est `node:sqlite`)
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

## Développement local

La cible v0.1 est Electron + serveur Node + SQLite, pas PostgreSQL.

```bash
bun run dev:desktop
```

`bun run dev:server` et `bun run dev:web` restent utiles en hot-reload, avec le même contrat RPC
loopback. Le compose Postgres et `X-Noyau-Actor-Id` appartiennent à l'arbre précédent : ne pas
les étendre.

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

Les dépôts de référence pour les agents vivent sous `repos/` en git subtree. Lecture seule :
ne jamais modifier ces arborescences et ne jamais importer depuis `repos/`.

| Subtree        | Source                                                  | Usage agent                                                                |
| -------------- | ------------------------------------------------------- | -------------------------------------------------------------------------- |
| `repos/effect` | [Effect-TS/effect](https://github.com/Effect-TS/effect) | API et primitives Effect v4 — lire `repos/effect/LLMS.md` en premier       |
| `repos/t3code` | [pingdotgg/t3code](https://github.com/pingdotgg/t3code) | Patterns Effect applicatifs (decider, projector, reactors, Schema, Layers) |

Pour synchroniser le subtree Effect après un bump du catalogue :

```bash
git subtree pull \
  --prefix=repos/effect \
  https://github.com/Effect-TS/effect.git \
  effect@4.0.0-beta.107 \
  --squash
```

Pour synchroniser le subtree t3code :

```bash
git fetch https://github.com/pingdotgg/t3code.git main:refs/remotes/t3code-upstream/main
git subtree pull \
  --prefix=repos/t3code \
  refs/remotes/t3code-upstream/main \
  --squash
```

## Scripts

| Commande               | Effet                                                         |
| ---------------------- | ------------------------------------------------------------- |
| `bun run check`        | `vp check` (format + lint type-aware + type check) puis `tsc` |
| `bun run lint`         | Oxlint type-aware, règles Effect incluses                     |
| `bun run lint:fix`     | idem avec corrections automatiques                            |
| `bun run format`       | Oxfmt en écriture                                             |
| `bun run format:check` | Oxfmt en vérification                                         |
| `bun run typecheck`    | `tsc` par workspace, ordonné et caché par Vite Task           |
| `bun run test`         | Vitest par workspace, caché par Vite Task                     |
| `bun run build`        | build par workspace, caché par Vite Task                      |
| `bun run dev:server`   | serveur local avec rechargement Bun                           |
| `bun run dev:web`      | serveur de dev de `apps/web`                                  |

Les tâches passent par Vite Task (`vp run`), qui remplace Turborepo. Il n'y a pas d'`inputs` ni
d'`outputs` à déclarer : le suivi automatique observe les fichiers réellement lus et écrits par
chaque tâche. `vp run --last-details` explique chaque hit et chaque miss, `vp cache clean` vide le
cache.

Deux commandes Vite+ existent aussi hors scripts : `vp check --fix` pour la boucle de dev, et
`vp test watch` pour les tests en watch (`vp test` seul ne watch pas).

## Structure

Les workspaces vivent dans `apps/*` et `packages/*`. On en ajoute un seulement lorsqu'une frontière
est réelle et testée.
