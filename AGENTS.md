# Noyau — guide agents

Control plane durable pour un LifeOS personnel : projets, forum, missions, agents Hermes, n8n.
Lire [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) avant toute décision structurante.

## Glossaire

| Terme                | Sens                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------ |
| **Noyau**            | Control plane : état, permissions, commandes, événements, projections.                     |
| **Marion**           | Cheffe d'orchestre LLM ; planifie et coordonne, ne possède pas l'état.                     |
| **Hermes**           | Premier adaptateur du port `AgentRuntime` ; exécution isolée en container/worktree.        |
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
| **ContextPack**      | Contexte LLM versionné et ciblé ; jamais l'historique brut du forum.                       |
| **Capability grant** | Permission étroite, temporaire, attachée à un run — pas au rôle ni au prompt.              |
| **Approval**         | Demande d'approbation humaine persistée (`waiting_human`).                                 |

Modèle cible : `Project → Mission → Task → Attempt → AgentRun`. Forum (`Channel/Thread/Message`) séparé.

## Flux cible

```text
Command (Schema) → Decider pur → Transaction PG (event + receipt + projection + outbox)
  → Reactors durables → Ports runtime (AgentRuntime, WorkflowEngine, MemoryStore, GitRuntime)
  → Snapshot + deltas (RPC/HTTP typé, flux ordonné)
```

PostgreSQL porte la durabilité. Une `Queue` ou un `PubSub` Effect ne remplace jamais l'outbox.

## Carte du repo

```text
apps/
  web/                  # UI React (TanStack Router, Vite) — pas d'Effect dans l'état local
  control-plane/        # (à créer) API commandes, SSE/WebSocket
  worker/               # (à créer) reactors, scheduler, leases

packages/
  config/               # tsconfig.base.json partagé, diagnostics @effect/tsgo
  domain/               # (à créer) deciders et projectors purs
  protocol/             # (à créer) Schemas commandes/événements, exports subpath
  …                     # voir docs/ARCHITECTURE.md — un package seulement si frontière réelle

docs/
  ARCHITECTURE.md       # Vision, invariants, ordre de construction
  agents/               # Issue tracker, domain docs
  adr/                  # Décisions système (quand elles existent)

repos/effect/           # Subtree Effect v4 — lecture seule, jamais importé
.agents/skills/         # Skills Cursor du repo
```

Workspaces Bun : `apps/*`, `packages/*`. Stack : Bun, Turbo, Oxfmt, Oxlint, Effect v4, TypeScript 7.

## Agent skills

### Issue tracker

Issues et specs dans GitHub Issues ; utiliser `gh`. Voir [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md).

### Domain docs

Monorepo multi-contexte : lire `CONTEXT-MAP.md`, le `CONTEXT.md` de l'app ou du package touché, et les ADR applicables. Voir [`docs/agents/domain.md`](docs/agents/domain.md).

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

Pendant le travail, checks ciblés sur les workspaces touchés. Avant commit ou PR, suite complète :

| Commande        | Effet                           |
| --------------- | ------------------------------- |
| `bun run check` | format:check + lint + typecheck |
| `bun run test`  | tests Turbo sur les workspaces  |
| `bun run build` | build Turbo                     |

Le subtree `repos/effect/` n'a pas besoin d'être typechecké ni testé par la CI Noyau.

Avec `packages/domain`, utiliser `@effect/vitest` : `it.layer`, `TestClock`, `DrainableWorker.drain` pour les reactors éphémères. La reprise après crash reste en base.

## Pièges fréquents

| Piège                                         | Choix Noyau                                         |
| --------------------------------------------- | --------------------------------------------------- |
| `Queue` / `PubSub` comme source de vérité     | PostgreSQL + outbox transactionnelle                |
| Decider qui touche IO ou l'état mutable       | Decider pur ; IO dans les reactors                  |
| Barrels et imports circulaires                | Exports subpath dès `protocol` / `domain`           |
| `fetch` / `crypto.randomUUID` en dur          | Services injectés via `Layer`                       |
| `Context.Tag` par instance de runtime         | Registry singleton + adaptateur en valeur           |
| Effect Atom dans React                        | Effect aux frontières ; état UI React idiomatique   |
| Snapshot et subscribe en parallèle sans ordre | Snapshot d'abord, puis flux d'événements            |
| Métriques avec IDs libres                     | Labels bornés : `commandType`, `outcome`, `runtime` |
| Approvals ou états `waiting_*` en mémoire     | Entités persistées ; réveil par événement           |
| Autonomie `full-access` par défaut            | Niveau 0–1 ; capability grants par run              |
| Package ou workspace sans frontière testée    | Attendre une frontière réelle                       |

## Opérations dangereuses

Ne pas faire sans instruction explicite de l'humain :

- modifier, committer ou importer depuis `repos/effect/` ;
- bump Effect sans sync subtree et sans vérifier les breaking changes beta ;
- désactiver un diagnostic `@effect/tsgo` ou `--no-verify` sur un hook ;
- créer un workspace ou un package sans frontière testée ;
- secrets, tokens ou credentials dans le code ou les commits ;
- IDs non brandés ou payloads non décodés aux frontières.

## Références

- Architecture : [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- README (install, scripts, subtree) : [`README.md`](README.md)
