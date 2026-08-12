# Noyau — contexte d'architecture

Ce document sert de contexte de passation pour les agents qui contribueront au projet Noyau.
Il décrit la vision, les décisions d'architecture et l'ordre de construction recommandé. Il ne
constitue pas encore une spécification figée : les choix marqués « à décider » doivent être
confirmés avant leur implémentation.

## Vision

Noyau est le socle d'un LifeOS personnel permettant de piloter des projets et des agents depuis
une application web.

Chaque projet doit disposer :

- d'un ou plusieurs dépôts Git associés ;
- d'un espace de discussion de type channel/forum ;
- de missions décomposées en tâches ;
- d'une cheffe d'orchestre appelée Marion ;
- d'agents spécialisés que Marion peut mobiliser ;
- d'un historique durable des décisions, messages, exécutions et artefacts ;
- de workflows n8n que les agents peuvent proposer et tester sous contrôle.

Marion planifie et coordonne. Elle ne doit pas être l'endroit où réside l'état du système. Noyau
possède l'état durable, les permissions et les règles ; Hermes est un moteur d'exécution d'agents
remplaçable.

## Stack souhaitée

- monorepo TypeScript 7 ;
- Bun est actuellement le package manager/runtime initial du dépôt ;
- Vite+ comme toolchain unique : Vite, Rolldown, Vitest, Oxlint, Oxfmt, tsdown et Vite Task
  épinglés ensemble, configurés dans un `vite.config.ts` racine ;
- Effect autant que pertinent côté serveur et domaine ;
- PostgreSQL comme source de vérité ;
- application web React avec Vite et TanStack Router ;
- control plane HTTP avec Effect `HttpApi` sur le runtime Bun ;
- Hermes Agent comme premier runtime d'agents ;
- n8n comme moteur d'automatisations déterministes ;
- Mem0 comme couche de mémoire long terme des agents, derrière un port et jamais source de vérité ;
- OpenTelemetry pour les traces, métriques et corrélations.

Effect doit notamment servir pour les erreurs typées, `Schema`, les services et `Layer`, la
concurrence structurée, les retries, les timeouts, la configuration et l'observabilité. Il n'est
pas nécessaire de forcer Effect dans l'état local des composants React.

## Principe d'architecture

Noyau doit être construit comme un control plane durable autour de runtimes isolés.

```text
                         +----------------------+
                         |       Web App        |
                         | forum, tâches, diffs |
                         +----------+-----------+
                                    |
                              SSE + HTTP
                                    |
+--------------+         +----------v-----------+
| Git provider +-------->|  Noyau Control Plane |
| webhooks     |         | commandes + policies|
+--------------+         +------+-------+-------+
                                |       |
                     +----------v--+ +--v-------------+
                     | PostgreSQL | | Workflow Engine |
                     | état/events| | missions/tasks  |
                     +-------------+ +--+--------------+
                                       |
                                +------v-------+
                                |  Scheduler   |
                                +------+-------+
                                       |
                 +---------------------+---------------------+
                 |                     |                     |
          +------v------+       +------v------+      +------v-----+
          | Hermes Run  |       | Hermes Run  |      | n8n Gateway|
          | développeur |       | reviewer     |      | draft/test |
          +------+------+       +------+------+      +------------+
                 |                     |
          container/worktree    container/worktree
```

Commencer par un modular monolith : un control plane, un worker, PostgreSQL, Hermes et n8n. Ne
pas introduire Kafka, Kubernetes ou une constellation de microservices au début.

## Responsabilités

### Noyau

Noyau possède :

- projets, dépôts et channels ;
- missions, tâches, dépendances et tentatives ;
- messages et questions ;
- profils d'agents ;
- politiques d'autonomie et permissions ;
- approbations humaines ;
- budgets de temps et de tokens ;
- événements, journaux et artefacts ;
- versions des prompts, outils et profils ;
- propositions et versions de workflows n8n.

### Marion

Marion doit pouvoir :

- lire le contexte ciblé d'un projet ;
- transformer une demande en plan structuré ;
- construire un DAG de tâches ;
- sélectionner un profil d'agent ;
- définir les permissions, budgets et critères d'acceptation ;
- recevoir des rapports synthétiques ;
- replanifier après un résultat ou un échec ;
- demander une décision humaine.

Par défaut, Marion ne devrait pas disposer d'un terminal. Ses outils principaux sont les commandes
du control plane.

### Agents spécialisés

Chaque agent spécialisé travaille sur une tâche bornée, dans une exécution indépendante. Il reçoit
un contexte minimal, des capacités temporaires et des critères d'acceptation explicites.

### n8n

n8n exécute les automatisations répétables : intégrations, webhooks, synchronisations et tâches
planifiées. Il ne doit pas devenir l'orchestrateur principal du raisonnement multi-agent.

## Modèle de domaine initial

```text
Project
 |- Repository
 |- Channel
 |   `- Thread
 |       `- Message
 `- Mission
     |- Task
     |   |- TaskDependency
     |   |- Attempt
     |   |   `- AgentRun
     |   |- Artifact
     |   `- Approval
     `- WorkflowProposal
```

Entités/tableaux à prévoir :

- `projects`
- `repositories`
- `channels`
- `threads`
- `messages`
- `missions`
- `tasks`
- `task_dependencies`
- `task_attempts`
- `agent_profiles`
- `agent_runs`
- `artifacts`
- `approvals`
- `capability_grants`
- `workflow_definitions`
- `workflow_versions`
- `workflow_deployments`
- `events`
- `outbox`

Toutes les identités importantes doivent utiliser des identifiants opaques et brandés. Tous les
payloads entrant ou sortant d'un processus doivent être décodés avec `Effect.Schema`.

## Cycle de vie d'une tâche

```text
proposed -> ready -> leased -> running
                              |- waiting_human
                              |- waiting_agent
                              |- verifying -> completed
                              `- failed / cancelled
```

Le LLM ne modifie jamais directement cet état ou la base de données. Il appelle une commande typée,
le control plane vérifie les droits et les invariants, écrit l'événement, puis déclenche la suite.

À la frontière HTTP, le client soumet une `CommandRequest` avec un `commandId`, une commande, son
payload et éventuellement l'événement qui l'a causée. Le control plane possède et ajoute
`projectId`, `actorId`, l'horodatage et la version de schéma. Il dérive la corrélation de la causalité
vérifiée, ou utilise `commandId` comme racine.

Commandes initiales envisagées :

- `task.create`
- `task.assign`
- `task.complete`
- `task.fail`
- `agent.spawn`
- `agent.interrupt`
- `message.send`
- `question.ask`
- `report.submit`
- `memory.write`
- `approval.request`
- `workflow.propose`
- `workflow.validate`
- `workflow.request_publish`

Chaque commande et événement doit inclure au minimum :

- un identifiant unique ;
- `projectId` ;
- `actorId` ;
- `correlationId` ;
- `causationId` si applicable ;
- un horodatage ;
- une version de schéma.

## Événements et durabilité

PostgreSQL est la source de vérité. Utiliser un journal d'événements append-only et un transactional
outbox pour publier les effets secondaires sans perdre d'événements.

La commande enrichie et sa request canonique sont persistées avec leur scope avant décision, dans la
même transaction que le receipt et les événements éventuels. Un retry identique rend le receipt
original ; réutiliser un `commandId` avec un autre contenu, projet ou acteur est un conflit.

Les commandes visant le même agrégat sont sérialisées par un verrou PostgreSQL durable et chaque
événement porte une version d'agrégat unique. Le flux client est ordonné par une position
transactionnelle propre au projet : un `bigserial` PostgreSQL ne constitue pas un ordre de commit et
ne doit pas servir de curseur.

Le client lit d'abord un snapshot cohérent avec son `EventCursor`, puis reprend un flux SSE filtré par
projet. Le curseur est opaque, versionné et lié au projet. Le flux garantit l'ordre et une livraison
au moins une fois ; le client déduplique avec `eventId`. Le polling du journal est durable ;
`LISTEN/NOTIFY` pourra accélérer le réveil sans devenir source de vérité.

Pour un premier déploiement sur un VPS :

- PostgreSQL stocke l'état, les événements et les leases ;
- les workers réclament une tâche avec verrouillage et expiration de lease ;
- `LISTEN/NOTIFY` peut accélérer le réveil, mais ne doit jamais être la source de durabilité ;
- toutes les commandes susceptibles d'être répétées ont une clé d'idempotence.

Prévoir une abstraction `WorkflowEngine`, implémentée dans PostgreSQL : leases avec expiration,
timers persistés et reprise après crash. Les attentes humaines et inter-agents sont des états
(`waiting_human`, `waiting_agent`) réveillés par événement, jamais des processus bloqués en mémoire.
Cette machine à états maison doit donc assumer elle-même retries, timeouts et réveils différés ; le
port `WorkflowEngine` protège un éventuel remplacement futur si les missions deviennent trop
complexes.

## Forum et communication inter-agents

Le forum est une projection lisible de l'activité, pas le contexte brut du LLM.

Un message doit pouvoir référencer :

- `projectId` ;
- `missionId` ;
- `taskId` ;
- `runId` ;
- auteur et audience ;
- `replyTo` ;
- `correlationId` ;
- un type : `message`, `question`, `report`, `decision` ou `alert`.

Les agents ne s'appellent pas directement. Ils communiquent via Noyau :

```text
Agent A -> message.send(to: Agent B)
        -> événement persistant
        -> scheduler réveille Agent B
        -> réponse persistée
        -> Agent A reprend
```

Cette médiation empêche les tempêtes de délégation, conserve l'audit et permet de suspendre une tâche
pendant une question.

Ne jamais injecter tout l'historique du forum dans un prompt. Construire un `ContextPack` versionné et
ciblé contenant seulement : objectif, critères d'acceptation, décisions pertinentes, résumé des
échanges, fichiers utiles et capacités disponibles.

## Mémoire long terme des agents (Mem0)

Mem0 stocke ce qui doit survivre aux missions : préférences, conventions apprises, décisions
récurrentes, leçons tirées d'échecs. Il complète le `ContextPack`, il ne le remplace pas.

Invariants :

- PostgreSQL reste la source de vérité. Les mémoires sont dérivées des événements et doivent
  pouvoir être reconstruites ou purgées sans perte d'état ;
- accès uniquement via un port `MemoryStore` du control plane, jamais d'appel direct par un agent ;
- écriture via une commande typée (`memory.write`), soumise aux mêmes policies que les autres
  commandes ;
- mémoires scopées par projet et par profil d'agent, pas de mémoire globale par défaut ;
- jamais de secret dans une mémoire ;
- une mémoire écrite à partir de contenu externe (repo, issue, page web) est un vecteur de
  persistance de prompt injection : marquer la provenance, la traiter comme non fiable et prévoir
  révision et expiration ;
- dans un `ContextPack`, les mémoires récupérées sont citées avec leur identifiant pour rester
  auditables.

## Intégration Hermes

Hermes est le premier adaptateur d'un port générique :

```ts
interface AgentRuntime {
  readonly start: (
    input: AgentRunInput,
  ) => Effect.Effect<RunHandle, AgentRuntimeError>

  readonly interrupt: (
    runId: AgentRunId,
  ) => Effect.Effect<void, AgentRuntimeError>

  readonly events: (
    runId: AgentRunId,
  ) => Stream.Stream<AgentEvent, AgentRuntimeError>
}
```

Utiliser l'API HTTP publique et streamée d'Hermes plutôt que les WebSockets internes de son dashboard.
Créer un MCP ou plugin Noyau exposant uniquement les commandes autorisées aux agents.

Ne pas baser l'architecture de Noyau sur `delegate_task` : les sous-agents Hermes sont adaptés aux
sous-tâches temporaires mais pas à la collaboration durable souhaitée. Noyau doit lancer des runs
Hermes indépendants et considérer Hermes comme remplaçable.

Pour chaque run :

- créer un container isolé ;
- créer un checkout ou `git worktree` dédié ;
- utiliser une branche dédiée ;
- injecter un profil, un prompt et une liste de capacités versionnés ;
- limiter CPU, mémoire, durée, tokens et profondeur de délégation ;
- ne jamais monter le socket Docker ;
- journaliser les appels d'outils en redigeant les secrets ;
- détruire ou archiver proprement l'environnement à la fin.

## Git et artefacts

Un agent de code ne travaille jamais directement sur la branche principale.

Flux recommandé :

```text
Task
 -> worktree + branche dédiée
 -> changements
 -> format/lint/typecheck/tests
 -> rapport et diff
 -> review agent
 -> approbation
 -> pull request
```

Les artefacts peuvent être des patches, commits, rapports, logs de tests, captures ou fichiers. Les
gros blobs doivent être placés dans un stockage objet à terme ; PostgreSQL conserve leurs métadonnées
et sommes de contrôle.

## Workflows n8n créés par les agents

Les agents ne reçoivent jamais une clé d'administration n8n. Ils utilisent un gateway restreint :

- `workflow.inspect`
- `workflow.draft`
- `workflow.validate`
- `workflow.test`
- `workflow.diff`
- `workflow.request_publish`

Cycle de promotion :

```text
proposition agent
 -> définition JSON versionnée dans Git
 -> validation du schéma
 -> contrôle des nodes et expressions
 -> installation dans n8n-dev
 -> exécution sur fixtures
 -> revue humaine ou Marion
 -> pull request
 -> promotion vers n8n-prod
```

Séparer n8n-dev et n8n-prod : bases, réseaux, API keys et credentials distincts. Les credentials sont
référencés par alias, par exemple `credential://github/noyau`, et ne sont jamais renvoyés en clair à
l'agent.

Au départ, bloquer les nodes permettant l'exécution arbitraire, l'accès au filesystem, les community
nodes non audités et les sorties réseau non autorisées. La publication en production nécessite une
approbation explicite.

## Politique d'autonomie

Définir des niveaux configurables par projet :

```text
0  proposer uniquement
1  lire et planifier
2  modifier une branche et tester
3  créer un workflow ou une PR en brouillon
4  publier après approbation
5  exécuter automatiquement dans un périmètre pré-approuvé
```

Toujours exiger une approbation pour :

- suppression ou action difficilement réversible ;
- dépense ou engagement financier ;
- publication externe ;
- accès à un nouveau secret ;
- modification d'infrastructure ;
- merge ou déploiement en production hors politique explicite.

Les permissions doivent être des capacités étroites, temporaires et attachées à un run. Un agent ne
doit pas déduire une permission de son rôle ou de son prompt.

## Sécurité

Considérer le contenu des repos, issues, pages web, emails et webhooks comme non fiable et susceptible
de contenir du prompt injection.

Invariants :

- séparer instructions système, contexte de confiance et contenu externe ;
- ne jamais exposer un secret en clair au modèle ;
- filtrer les outils par run ;
- contrôler les sorties réseau ;
- limiter ressources, durée, coût et récursion ;
- conserver un audit append-only ;
- rendre les actions externes idempotentes ;
- fournir un kill switch par run, mission et projet ;
- versionner prompts, profils, modèles et manifestes d'outils ;
- conserver l'entrée exacte d'un run pour pouvoir l'évaluer ou l'expliquer, sans prétendre rejouer
  un LLM de manière déterministe.

## Structure de monorepo proposée

```text
apps/
  web/
  control-plane/
  worker/

packages/
  domain/
  protocol/
  database/
  orchestration/
  agent-runtime/
  agent-hermes/
  git-runtime/
  n8n-gateway/
  memory/
  policy/
  observability/
  testing/

infra/
  compose/
  migrations/
  images/
```

Ne pas créer tous les packages dès le premier commit. Introduire un package lorsqu'une frontière est
réelle et testée. Le premier socle peut se limiter à `web`, `control-plane`, `worker`, `domain` et
`protocol`.

## Première tranche verticale

Le premier objectif fonctionnel n'est pas « avoir tous les agents ». C'est ce parcours complet :

1. connecter un dépôt à un projet ;
2. poster une demande dans son channel ;
3. faire produire à Marion un plan typé ;
4. créer deux tâches avec une dépendance ;
5. lancer deux runs indépendants dans des worktrees ;
6. laisser un agent poser une question visible dans l'interface ;
7. reprendre la tâche après la réponse ;
8. exécuter formatage, lint, typecheck et tests ;
9. faire produire un rapport et un diff ;
10. proposer une pull request après approbation.

Ce scénario doit continuer à fonctionner après le redémarrage du control plane ou du worker.

## Ordre d'implémentation recommandé

1. Configurations monorepo et conventions TypeScript/Effect.
2. Schémas `Project`, `Repository`, `Channel`, `Message`, `Mission` et `Task`.
3. PostgreSQL, migrations, event log et outbox.
4. API de commandes et flux d'événements SSE.
5. Interface projet/channel/tâches minimale.
6. Port `AgentRuntime` et adaptateur Hermes pour un run isolé.
7. Worktrees, artefacts, interruption et reprise.
8. Plan structuré de Marion et scheduler de DAG.
9. Questions, rapports et approbations.
10. Review agent, tests et création de pull request.
11. Gateway n8n-dev puis promotion contrôlée.
12. Budgets, traces, évaluations, politiques avancées et hardening.

## Choix encore ouverts

Ces décisions doivent être prises au moment où elles deviennent nécessaires :

- Mem0 auto-hébergé (OSS/OpenMemory) ou plateforme managée, et périmètre exact des mémoires ;
- stockage objet local/S3-compatible pour les artefacts ;
- fournisseur Git initial ;
- mode précis de provisionnement des containers Hermes ;
- système de secrets et credential broker.

Éviter de décider ces points uniquement pour remplir le scaffold. Chaque choix doit être justifié par
la première tranche verticale et protégé derrière un port lorsque le remplacement est plausible.

## Règles pour les agents qui travaillent sur le repo

- Lire ce document avant toute modification structurelle.
- Préserver le modular monolith tant qu'une séparation de déploiement n'est pas nécessaire.
- Faire passer toute donnée de frontière par un schéma runtime.
- Ne jamais donner au LLM un accès direct à PostgreSQL, Git, Docker, n8n ou aux secrets.
- Ajouter les invariants métier au domaine, pas uniquement dans les prompts.
- Écrire les opérations externes de façon idempotente.
- Ne pas confondre message de forum, contexte de modèle et événement de domaine.
- Toute tâche autonome doit avoir un budget, une politique d'outils, un timeout et un kill switch.
- Toute fonctionnalité critique doit être testable sans appeler un vrai modèle LLM.
- Préférer une tranche verticale fonctionnelle à une arborescence exhaustive de packages vides.

