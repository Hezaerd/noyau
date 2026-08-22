# Noyau — guide agents

Control plane durable pour un LifeOS personnel : Environment local, Tableau et Threads Cursor.
Lire [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) avant toute décision structurante.

## Glossaire

| Terme                 | Sens                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------ |
| **Noyau**             | Control plane : état, commandes, événements et projections.                                |
| **Environment**       | Autorité locale unique d'une installation.                                                 |
| **Noyau Desktop**     | Client Electron et superviseur ; aucun état métier autoritatif.                            |
| **Noyau Server**      | Processus Node local ; unique autorité durable de sa base SQLite.                          |
| **Project**           | Dossier existant relié, avec un Tableau et des Threads.                                    |
| **WorkspaceRoot**     | Chemin du dossier où Noyau et Cursor travaillent.                                          |
| **Checkout**          | Liaison Thread → cwd : `worktreePath` (`null` = WorkspaceRoot) + `branch` (snapshot).      |
| **threadEnvMode**     | Intention de draft `local \| worktree`. Matérialisée au premier Turn.                      |
| **GitRuntime**        | Capacité live `git`/`gh` du Server ; hors journal.                                         |
| **Tableau**           | Projection Kanban unique d'un Project ; colonnes libres et ordre partagé.                  |
| **Ticket**            | Élément de travail durable : titre, détails, cycle Kanban, audit et dépendances.           |
| **Responsable**       | Acteur durable optionnel d'un Ticket ; masqué de l'UI v0.1.                                |
| **Dépendance Ticket** | Relation orientée « dépend de » ; l'ensemble forme un DAG.                                 |
| **TicketThread**      | Lien optionnel plusieurs-à-plusieurs entre un Ticket et un Thread.                         |
| **Thread**            | Conversation provider titrée d'un Project (`Project → Thread → Turn`).                     |
| **Session**           | Projection `0..1` du runtime provider sur un Thread.                                       |
| **Turn**              | Unité append-only de travail agent. `latestTurn` : running, interrupted, completed, error. |
| **resumeCursor**      | `{ schemaVersion, sessionId }` opaque pour `session/load`.                                 |
| **runtimeMode**       | Politique d'outils t3code du Thread.                                                       |
| **Command**           | Entrée typée (`commandId`, acteur hors payload) persistée avant effet.                     |
| **Event**             | Fait immuable produit par un decider pur.                                                  |
| **Projection**        | Vue dérivée reconstruite depuis le journal.                                                |
| **Receipt**           | Preuve d'idempotence d'une commande ; réponse stable aux retries.                          |
| **TxQueue**           | File mémoire post-commit pour les reactors ; vide au boot, pas une outbox de reprise.      |
| **Reactor**           | Consommateur de la `TxQueue` pour un effet externe (Cursor).                               |

Modèle v0.1 : `Environment → Project → (Tableau → Ticket) + (Thread → Session? → Turn)`. Lien
optionnel `TicketThread`. Pas de `Channel`, `Message`, Workbench, `Execution`, `Attempt`, outbox
SQL, Hermes ni PGlite (ADR-0011, ADR-0013).

## Flux cible

```text
Command (Schema) → Decider pur → Transaction SQLite (event + receipt + projection)
  → Reactors TxQueue (effets provider, après commit)
  → Snapshot + deltas (subscribeShell / subscribeProject / subscribeThread — ADR-0003)
```

Le store `node:sqlite` porte la durabilité (ADR-0012). Une `Queue` n'est jamais une source de
vérité. La reprise Session est une passe de projection au boot, pas le rejeu d'une file.

## Carte du repo

```text
apps/
  web/                  # renderer React partagé — pas d'Effect dans l'état local
  server/               # Noyau Server local (SQLite + Cursor)
  desktop/              # Electron : superviseur et chrome, sans état métier

packages/
  config/               # tsconfig.base.json partagé, diagnostics @effect/tsgo
  domain/               # deciders et projectors purs
  protocol/             # Schemas commandes/événements, contrat RPC, exports subpath
  database/             # journal SQLite, receipts, projections
  acp/                  # fil de fer ACP (codegen spec + AcpClient)
  shared/               # helpers purs composer (trigger, mentions)
  …                     # voir docs/ARCHITECTURE.md — un package seulement si frontière réelle

docs/
  ARCHITECTURE.md       # Vision, invariants, ordre de construction
  agents/               # Issue tracker, domain docs
  adr/                  # Décisions système (quand elles existent)

repos/effect/           # Subtree Effect v4 — lecture seule, jamais importé
repos/t3code/           # Subtree T3 Code — patterns Effect applicatifs, lecture seule
.agents/skills/         # Skills Cursor du repo

vite.config.ts          # Config unique fmt / lint / test / staged + tâches Vite Task
```

Workspaces Bun : `apps/*`, `packages/*`. Stack : Bun, Vite+, Effect v4, TypeScript 7.

Les recherches (ripgrep, Grep, glob) portent sur `apps/` et `packages/` par défaut. Exclure
`repos/` — les subtrees vendored noient les hits. N'y chercher que si la tâche l'exige
(signatures Effect, patterns t3code).

## Toolchain Vite+

Un seul paquet, `vite-plus`, fournit Vite, Rolldown, Vitest, Oxlint, Oxfmt, tsdown et Vite Task,
tous épinglés ensemble. La CLI est `vp` ; sans installation globale, le binaire local est dans
`node_modules/.bin`.

- Toute la config de lint, de format, de test et de tâches vit dans le `vite.config.ts` racine.
  Ne pas recréer de `.oxlintrc.json`, `.oxfmtrc.json`, `vitest.config.ts` ni `turbo.json`.
- La config de lint par workspace passe par `lint.overrides` à la racine. Un bloc `lint` dans le
  `vite.config.ts` d'un package est **silencieusement ignoré** par `vp lint`.
- Un nom de tâche ne peut pas exister à la fois dans `run.tasks` et dans les scripts d'un
  `package.json`.
- Les tâches tournent dans un environnement propre : seules `PATH`, `HOME`, `CI` passent. Toute
  variable nécessaire doit être déclarée en `env` (comptée dans l'empreinte de cache) ou en
  `untrackedEnv`.
- Ne pas déclarer d'`inputs`/`outputs` par réflexe : le suivi automatique observe les lectures et
  écritures réelles. N'ajouter un `input` que pour corriger un cas constaté, avec le motif en
  commentaire.
- Les diagnostics Effect sont appliqués par Oxlint via le preset `@effect/tsgo`. Ce montage exige
  que `vite-plus` fournisse exactement l'Oxlint et l'`oxlint-tsgolint` supportés par
  `@effect/tsgo` : vérifier `vp toolchain` avant tout bump de `vite-plus`.
- `vp migrate` réécrit les imports dans tout l'arbre, `repos/effect/` compris. Si la commande doit
  être relancée, faire suivre d'un `git checkout -- repos/`.

## Agent skills

### Issue tracker

Issues et specs dans GitHub Issues ; utiliser `gh`. Voir [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md).

### Domain docs

Monorepo multi-contexte : lire `CONTEXT-MAP.md`, le `CONTEXT.md` de l'app ou du package touché, et les ADR applicables. Voir [`docs/agents/domain.md`](docs/agents/domain.md).

### Stacked pull requests

- Qualifier une stack lorsqu'un changement forme au moins deux couches dépendantes, cohésives et indépendamment révisables.
- Avant de coder, expliciter l'ordre des couches du trunk vers le sommet ; placer les fondations dans les branches basses et leurs dépendants dans les branches hautes.
- Utiliser [`.agents/skills/gh-stack/SKILL.md`](.agents/skills/gh-stack/SKILL.md) pour les commandes et contraintes CLI.
- Préférer une PR classique pour un changement atomique, une correction isolée, des travaux indépendants ou des couches artificielles.
- Ne jamais merger une stack sans demande explicite ; utiliser `gh stack merge`.
- GitHub stacked PRs est en public preview et ne demande pas d'activation supplémentaire côté repository.

## Effect — conventions

Conventions détaillées : [`.cursor/rules/effect-v4.mdc`](.cursor/rules/effect-v4.mdc).

- Version unique via le catalogue Bun : `"effect": "catalog:"` dans chaque workspace ; pin exact dans `package.json` (`catalog.effect`).
- Ajouter une entrée catalogue seulement à l'usage réel d'un package Effect.
- API v4 correspondant à la version pin ; vérifier les signatures dans `repos/effect/` avant toute transposition d'API unstable.
- Lire `repos/effect/LLMS.md` en premier pour la doc Effect ; **ne jamais modifier ni importer depuis `repos/`**.
- Pour les patterns Effect applicatifs (command → decider → event → projector → reactor, Schema aux
  frontières, Layers testables), s'inspirer de `repos/t3code/` — en particulier `apps/server` et
  `packages/contracts`. Lire `repos/t3code/AGENTS.md` et `repos/t3code/docs/internals/` avant
  d'inventer une architecture parallèle.
- Sync subtree Effect après bump catalogue :

```bash
git subtree pull \
  --prefix=repos/effect \
  https://github.com/Effect-TS/effect.git \
  effect@<version-catalogue> \
  --squash
```

Sync subtree t3code :

```bash
git fetch https://github.com/pingdotgg/t3code.git main:refs/remotes/t3code-upstream/main
git subtree pull \
  --prefix=repos/t3code \
  refs/remotes/t3code-upstream/main \
  --squash
```

### Workflow Effect

- Décoder avec `Schema` toute donnée qui traverse une frontière de processus ou de confiance.
- Modéliser les erreurs attendues dans le canal d'erreur, avec des erreurs taguées.
- Exposer les capacités externes comme services ; construire les implémentations avec des `Layer`.
- Garder les appels `run*` aux points d'entrée de l'application seulement.
- Ne pas forcer Effect dans l'état local ou le rendu React.
- Imports `effect/unstable/*` permis s'ils apportent une vraie valeur, mais isolés derrière un port ou module interne.
- Un `Context.Tag` par provider ne convient pas aux instances multiples : registry = service singleton, adaptateur = valeur scopée.

### Diagnostics tsgo

Ne pas désactiver pour contourner un problème de design :

- `anyUnknownInErrorContext` — canaux E/R explicites
- `missingEffectServiceDependency` — Layers complets
- `leakingRequirements` — requirements cachés dans l'implémentation
- `preferSchemaOverJson` — frontières décodées
- `globalFetchInEffect` — client HTTP injecté
- `cryptoRandomUUIDInEffect` — `Crypto` testable
- `schemaSyncInEffect` — erreurs Schema dans le canal

## Vérifications

Pendant le travail, `vp check` sur les fichiers touchés. Avant commit ou PR, suite complète :

| Commande        | Effet                                                         |
| --------------- | ------------------------------------------------------------- |
| `bun run check` | `vp check` (format + lint type-aware + type check) puis `tsc` |
| `bun run test`  | Vitest par workspace via Vite Task                            |
| `bun run build` | build par workspace via Vite Task                             |

`vp check` est la boucle courte : une passe pour le formatage, le lint type-aware, les règles
Effect et un type check. `--fix` corrige format et lint. Les suggestions du preset Effect sortent
en `warn` et ne font pas échouer la commande ; les règles de correction sortent en `error`.

Vite Task cache `test`, `typecheck` et `build`. `vp run --last-details` explique chaque hit et
chaque miss ; `vp cache clean` vide le cache quand un résultat paraît faux.

Les subtrees `repos/effect/` et `repos/t3code/` n'ont pas besoin d'être typecheckés ni testés par la CI Noyau.

Avec `packages/domain`, utiliser `@effect/vitest` : `it.layer`, `TestClock`, `DrainableWorker.drain` pour les reactors éphémères. La reprise Session est une passe de projection au boot ; la `TxQueue` ne se rejoue pas.

## Pièges fréquents

| Piège                                         | Choix Noyau                                                 |
| --------------------------------------------- | ----------------------------------------------------------- |
| `Queue` / `PubSub` comme source de vérité     | Journal SQLite + receipts ; `TxQueue` n'est pas une reprise |
| Decider qui touche IO ou l'état mutable       | Decider pur ; IO dans les reactors                          |
| Barrels et imports circulaires                | Exports subpath dès `protocol` / `domain`                   |
| `fetch` / `crypto.randomUUID` en dur          | Services injectés via `Layer`                               |
| `Context.Tag` par instance dynamique          | Registry singleton + adaptateur en valeur                   |
| Effect Atom dans React                        | Effect aux frontières ; état UI React idiomatique           |
| Snapshot et subscribe en parallèle sans ordre | Snapshot d'abord, puis flux d'événements                    |
| Métriques avec IDs libres                     | Labels bornés : `commandType`, `outcome`                    |
| Checklist ou todolist dans un Ticket          | Tickets liés par un DAG                                     |
| Thread dédié ou Workbench par Ticket          | `TicketThread` optionnel N-N                                |
| `Execution` / `Attempt` / `Channel` / Hermes  | Thread + Session projetée + adaptateur Cursor (ADR-0013)    |
| Sweep d'orphelins `cursor-agent`              | Handle + `Scope` seulement                                  |
| Forge Git autre que GitHub                    | GitHub seulement (ADR-0006)                                 |
| Package ou workspace sans frontière testée    | Attendre une frontière réelle                               |
| Config lint dans le vite.config d'un package  | `lint.overrides` à la racine                                |
| `inputs`/`outputs` déclarés par réflexe       | Suivi automatique de Vite Task                              |

## Opérations dangereuses

Ne pas faire sans instruction explicite de l'humain :

- modifier, committer ou importer depuis `repos/effect/` ou `repos/t3code/` ;
- bump Effect sans sync subtree et sans vérifier les breaking changes beta ;
- désactiver un diagnostic `@effect/tsgo` ou `--no-verify` sur un hook ;
- bump `vite-plus` sans vérifier `vp toolchain` contre les versions Oxlint supportées par
  `@effect/tsgo` — un décalage fait sauter les diagnostics Effect en silence ;
- relancer `vp migrate` sans restaurer `repos/` derrière ;
- créer un workspace ou un package sans frontière testée ;
- secrets, tokens ou credentials dans le code ou les commits ;
- IDs non brandés ou payloads non décodés aux frontières.

## Références

- Architecture : [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- README (install, scripts, subtree) : [`README.md`](README.md)
