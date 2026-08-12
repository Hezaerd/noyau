# Noyau — guide agents

Control plane durable pour un LifeOS personnel : projets, forum, missions, agents Hermes, n8n.
Lire [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) avant toute décision structurante.

## Glossaire

| Terme                | Sens                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------ |
| **Noyau**            | Control plane : état, permissions, commandes, événements, projections.                     |
| **Marion**           | Cheffe d'orchestre LLM ; planifie et coordonne, ne possède pas l'état.                     |
| **Hermes**           | Premier adaptateur du port `AgentRuntime` ; run isolé, instance locale ou Tailscale.       |
| **Mission**          | Regroupement de tâches orienté objectif ; racine du DAG.                                   |
| **Task**             | Unité de travail bornée avec critères d'acceptation et état de cycle de vie.               |
| **Attempt**          | Tentative d'exécution d'une tâche ; porte worktree, artefacts et runs.                     |
| **AgentRun**         | Exécution concrète d'un agent sur une tentative.                                           |
| **Command**          | Entrée typée (`commandId`, `actorId`, `projectId`, `correlationId`) persistée avant effet. |
| **Event**            | Fait immuable produit par un decider pur à partir d'une commande.                          |
| **Projection**       | Vue dérivée (forum, tâches, runs) reconstruite depuis le journal d'événements.             |
| **Reactor**          | Consommateur durable de l'outbox (scheduler, Hermes, Git, n8n).                            |
| **Outbox**           | File transactionnelle PostgreSQL ; seule source de reprise après crash.                    |
| **Lease**            | Verrou temporaire avec expiration pour réclamer une tâche entre workers.                   |
| **Receipt**          | Preuve d'idempotence d'une commande ; réponse stable aux retries.                          |
| **ContextPack**      | Contexte LLM versionné, tiré des projections Noyau ; jamais l'historique brut du forum.    |
| **Capability grant** | Permission étroite, temporaire, attachée à un run — pas au rôle ni au prompt.              |
| **Approval**         | Demande d'approbation humaine persistée (`waiting_human`).                                 |

Modèle cible : `Project → Mission → Task → Attempt → AgentRun`. Forum (`Channel/Thread/Message`) séparé.

## Flux cible

```text
Command (Schema) → Decider pur → Transaction PG (event + receipt + projection + outbox)
  → Reactors durables → Ports runtime (AgentRuntime, WorkflowEngine, GitRuntime)
  → Snapshot + deltas (Effect RPC sur WebSocket, flux ordonné — ADR-0003)
```

PostgreSQL porte la durabilité. Une `Queue` ou un `PubSub` Effect ne remplace jamais l'outbox.

## Carte du repo

```text
apps/
  web/                  # UI React (TanStack Router, Vite), PWA — pas d'Effect dans l'état local
  server/               # frontière Effect RPC (WebSocket), engine de commandes, reactors, scheduler

packages/
  config/               # tsconfig.base.json partagé, diagnostics @effect/tsgo
  domain/               # deciders et projectors purs
  protocol/             # Schemas commandes/événements, contrat RPC, exports subpath
  database/             # event log, receipts, outbox, projections PostgreSQL
  …                     # voir docs/ARCHITECTURE.md — un package seulement si frontière réelle

docs/
  ARCHITECTURE.md       # Vision, invariants, ordre de construction
  agents/               # Issue tracker, domain docs
  adr/                  # Décisions système (quand elles existent)

repos/effect/           # Subtree Effect v4 — lecture seule, jamais importé
.agents/skills/         # Skills Cursor du repo

vite.config.ts          # Config unique fmt / lint / test / staged + tâches Vite Task
```

Workspaces Bun : `apps/*`, `packages/*`. Stack : Bun, Vite+, Effect v4, TypeScript 7.

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
- Sync subtree après bump catalogue :

```bash
git subtree pull \
  --prefix=repos/effect \
  https://github.com/Effect-TS/effect.git \
  effect@<version-catalogue> \
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

Le subtree `repos/effect/` n'a pas besoin d'être typechecké ni testé par la CI Noyau.

Avec `packages/domain`, utiliser `@effect/vitest` : `it.layer`, `TestClock`, `DrainableWorker.drain` pour les reactors éphémères. La reprise après crash reste en base.

## Pièges fréquents

| Piège                                         | Choix Noyau                                            |
| --------------------------------------------- | ------------------------------------------------------ |
| `Queue` / `PubSub` comme source de vérité     | PostgreSQL + outbox transactionnelle                   |
| Decider qui touche IO ou l'état mutable       | Decider pur ; IO dans les reactors                     |
| Barrels et imports circulaires                | Exports subpath dès `protocol` / `domain`              |
| `fetch` / `crypto.randomUUID` en dur          | Services injectés via `Layer`                          |
| `Context.Tag` par instance de runtime         | Registry singleton + adaptateur en valeur              |
| Effect Atom dans React                        | Effect aux frontières ; état UI React idiomatique      |
| Snapshot et subscribe en parallèle sans ordre | Snapshot d'abord, puis flux d'événements               |
| Métriques avec IDs libres                     | Labels bornés : `commandType`, `outcome`, `runtime`    |
| Approvals ou états `waiting_*` en mémoire     | Entités persistées ; réveil par événement              |
| Mem0 / port `MemoryStore`                     | Pas en v1 ; ContextPack depuis l'état Noyau (ADR-0005) |
| Forge Git autre que GitHub                    | GitHub seulement (ADR-0006)                            |
| Cluster de containers Hermes                  | Instance locale ou Tailscale (ADR-0007)                |
| Autonomie `full-access` par défaut            | Niveau 0–1 ; capability grants par run                 |
| Package ou workspace sans frontière testée    | Attendre une frontière réelle                          |
| Config lint dans le vite.config d'un package  | `lint.overrides` à la racine                           |
| `inputs`/`outputs` déclarés par réflexe       | Suivi automatique de Vite Task                         |

## Opérations dangereuses

Ne pas faire sans instruction explicite de l'humain :

- modifier, committer ou importer depuis `repos/effect/` ;
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
