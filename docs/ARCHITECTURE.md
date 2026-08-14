# Noyau — contexte d'architecture

Ce document sert de contexte de passation pour les agents qui contribueront au projet Noyau.
Il décrit la vision, les décisions d'architecture et l'ordre de construction recommandé. Il ne
constitue pas encore une spécification figée : les choix marqués « à décider » doivent être
confirmés avant leur implémentation.

## Vision

Noyau est le socle d'un LifeOS personnel permettant de piloter des projets et des agents depuis
une application web.

Chaque projet doit disposer :

- d'un ou plusieurs dépôts GitHub associés ;
- d'un espace de discussion de type channel/forum ;
- d'un tableau Kanban unique pour organiser des tickets humains-agents ;
- d'un historique durable des décisions, messages, exécutions et artefacts ;
- de workflows n8n que les agents peuvent proposer et tester sous contrôle.

Un projet peut fonctionner sans agent ou utiliser les profils d'agents configurés par ses
utilisateurs. Un profil peut notamment jouer un rôle d'orchestration, mais ce rôle ne crée ni type
d'entité ni permission implicite. Noyau possède l'état durable, les permissions et les règles ;
Hermes est un moteur d'exécution d'agents remplaçable.

## Stack souhaitée

- monorepo TypeScript 7 ;
- Bun est actuellement le package manager/runtime initial du dépôt ;
- Vite+ comme toolchain unique : Vite, Rolldown, Vitest, Oxlint, Oxfmt, tsdown et Vite Task
  épinglés ensemble, configurés dans un `vite.config.ts` racine ;
- Effect autant que pertinent côté serveur et domaine ;
- PostgreSQL comme source de vérité ;
- application web React avec Vite et TanStack Router, installable en PWA — elle couvre desktop et
  mobile pour la v1 ;
- serveur unique (`apps/server`) sur le runtime Bun ; frontière client en Effect RPC sur WebSocket
  (ADR-0003) ;
- Hermes Agent comme premier runtime d'agents, instance locale ou joignable par Tailscale
  (ADR-0007) ;
- n8n comme moteur d'automatisations déterministes ;
- GitHub comme unique forge (ADR-0006) ;
- OpenTelemetry pour les traces, métriques et corrélations.

Effect doit notamment servir pour les erreurs typées, `Schema`, les services et `Layer`, la
concurrence structurée, les retries, les timeouts, la configuration et l'observabilité. Il n'est
pas nécessaire de forcer Effect dans l'état local des composants React.

## Principe d'architecture

Noyau doit être construit comme un control plane durable autour de runtimes isolés.

```text
                         +----------------------+
                         |    Web App (PWA)     |
                         | forum, tickets, diffs|
                         +----------+-----------+
                                    |
                        Effect RPC (WebSocket)
                                    |
+--------------+         +----------v-----------+
|    GitHub    +-------->|     Noyau Server     |
| webhooks     |         | commandes + policies|
+--------------+         +------+-------+-------+
                                |       |
                     +----------v--+ +--v-------------+
                     | PostgreSQL | | Workflow Engine |
                     | état/events| | executions      |
                     +-------------+ +--+--------------+
                                       |
                                +------v-------+
                                |  Scheduler   |
                                +------+-------+
                                       |
                         +-------------+-------------+
                         |                           |
                  +------v-----------+       +-------v----+
                  | Attempt          |       | n8n Gateway|
                  | branche/worktree |       | draft/test |
                  +----+--------+----+       +------------+
                       |        |
              +--------v--+  +--v---------+
              | Hermes Run|  | Hermes Run |
              | principal |  | auxiliaire |
              +-----+-----+  +------+-----+
                    |               |
             processus/containers isolables
```

Commencer par un modular monolith : un seul processus serveur — frontière RPC, engine de
commandes, reactors et scheduler — plus PostgreSQL, Hermes et n8n (ADR-0004). Ne pas introduire
Kafka, Kubernetes ou une constellation de microservices au début.

## Topologie de déploiement

Le serveur tourne en durable sur un VPS, à côté de PostgreSQL. Hermes tourne sur la même machine
ou sur un hôte joignable par Tailscale (ADR-0007) — pas de cluster de containers à provisionner.
Les dépôts projet sont des dépôts GitHub (ADR-0006). Les clients s'y connectent en direct : pas de
relay, pas d'app desktop, pas d'app mobile native en v1. La web app en PWA couvre desktop et mobile.

Trois pièces sont volontairement différées au scénario « Noyau distribué à d'autres personnes » :

- un relay hébergé (découverte d'instances, credentials courte durée, notifications push) — utile
  seulement quand des serveurs Noyau tournent sur des machines personnelles derrière NAT ;
- une app desktop Electron — utile seulement si elle doit bundler et piloter un serveur local ;
- une app mobile native — utile seulement pour les notifications push natives et les Live
  Activities.

## Responsabilités

### Noyau

Noyau possède :

- projets, dépôts et channels ;
- tableau Kanban, tickets, dépendances, exécutions et tentatives ;
- messages et questions ;
- profils d'agents ;
- politiques d'autonomie et permissions ;
- approbations humaines ;
- budgets de temps et de tokens ;
- événements, journaux et artefacts ;
- versions des prompts, outils et profils ;
- propositions et versions de workflows n8n.

### Profils d'agents

Les profils d'agents sont configurés par les utilisateurs ; aucun agent ni orchestrateur n'est
natif ou obligatoire. Un profil peut lire le contexte ciblé d'un projet, proposer un plan, créer des
tickets reliés par un DAG de dépendances ou coordonner d'autres profils seulement lorsque ses
capability grants l'y autorisent. Son rôle affiché ne lui confère aucun droit.

Chaque agent travaille dans un `AgentRun` appartenant à un `Attempt` isolé. L'exécution qui porte
l'intention définit un résultat attendu, un budget et une politique d'outils ; le run reçoit un
contexte minimal et des capacités temporaires. Un profil orchestrateur devrait utiliser les
commandes du control plane plutôt qu'un terminal et ne possède jamais l'état de l'orchestration.

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
 |- KanbanColumn
 |- Label
 |- WorkflowProposal
 `- Ticket
     |- TicketDependency
     |- ChecklistItem
     |- TicketLabel
     |- Participant
     |- Subscription
     |- TicketThread
     |- Attachment
     `- Execution
         |- Attempt
         |   |- AgentRun
         |   `- Artifact
         `- Approval
```

Entités/tableaux à prévoir :

- `projects`
- `repositories`
- `channels`
- `threads`
- `messages`
- `kanban_columns`
- `labels`
- `tickets`
- `ticket_dependencies`
- `ticket_labels`
- `ticket_participants`
- `ticket_subscriptions`
- `checklist_items`
- `attachments`
- `executions`
- `attempts`
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

## Tracker Kanban

Chaque projet possède exactement un tableau. Le tableau n'est pas une entité autonome : c'est la
projection ordonnée des colonnes et tickets du projet.

- Les colonnes ordinaires sont librement nommées, ordonnées, créées et supprimées. Supprimer une
  colonne exige une destination active et non terminale ; `Done` ne doit jamais être acceptée. Dans
  la même transaction, Noyau déplace les tickets actifs et re-cible toutes les références vers la
  destination, notamment le `columnId` des tickets archivés et le `lastActiveColumnId` des tickets
  terminés. Aucune colonne supprimée ne doit rester référencée.
- Une colonne terminale `Done` possède une identité système unique et protégée ; son nom, sa couleur
  et sa position restent configurables.
- Chaque ticket possède un booléen `done`, source de vérité de sa clôture. Le toggle et les
  déplacements vers ou hors de la colonne `Done` restent bidirectionnellement cohérents. Une
  réouverture par toggle restaure le `lastActiveColumnId`, qui doit toujours désigner une colonne
  active et non terminale.
- L'ordre des tickets est partagé et durable dans chaque colonne. Les déplacements entre colonnes
  sont libres.
- Un ticket est plat : pas de sous-ticket. Une checklist reste interne ; un élément qui exige un
  responsable, une dépendance ou une exécution devient un ticket.
- Les dépendances forment un DAG. Un prérequis ouvert ajoute un badge `blocked-by` dérivé et empêche
  de lancer une nouvelle exécution, sans déplacer automatiquement la carte. Une clôture manuelle
  reste possible après avertissement. Si un prérequis est rouvert pendant une exécution dépendante,
  Noyau signale le blocage sans interrompre automatiquement le run déjà lancé.
- Un ticket archivé quitte le tableau actif mais conserve relations et historique. Il reste
  recherchable et restaurable dans son `columnId`, qui doit toujours désigner une colonne active et
  non terminale. La suppression définitive est une action distincte et protégée.

Le ticket exige seulement un titre. Il peut aussi porter une description, une priorité
(`none`, `low`, `normal`, `high`, `urgent`), une échéance, une checklist, des étiquettes, un
responsable unique et plusieurs participants explicites. Le responsable est un humain ou un profil
d'agent persistant — jamais un run. La participation ne confère aucun droit implicite.
L'étiquette native protégée `need-human` est un signal visuel manuel sans effet métier ; mentions,
questions explicites et abonnements déclenchent les notifications. Responsable et participants sont
abonnés par défaut avec opt-out.

Quand plusieurs tickets sont exécutables, l'ordonnancement par défaut considère successivement la
priorité, l'échéance puis l'ordre visuel de la carte dans sa colonne.

Chaque ticket possède un thread de travail dédié et peut référencer un thread source optionnel et
immuable. Les pièces jointes utilisateur appartiennent au ticket ; les artefacts versionnés
appartiennent aux attempts mais restent visibles depuis la carte.

## Cycles de vie du ticket et de l'exécution

Le ticket suit sa colonne, son booléen `done` et son éventuel archivage ; il ne reprend jamais les
états techniques d'un agent. Terminer ou archiver un ticket avec des exécutions actives exige une
confirmation puis l'interruption de chacune d'elles. Un fait d'interruption doit être émis pour
chaque exécution active, et tous ces faits doivent précéder le fait de clôture ou d'archivage. Les
exécutions dont le statut dérivé est déjà `completed`, `failed` ou `cancelled` ne reçoivent aucun
fait d'interruption. Une réassignation n'interrompt pas les exécutions existantes. Un ticket terminé
ou archivé doit être rouvert ou restauré avant tout nouveau lancement.

Une `Execution` est une intention durable de contribution agent, distincte de l'assignation du
ticket. La lancer est une commande explicite contrôlée par une capability grant. Elle porte un
résultat attendu libre, un budget et une politique d'outils. Plusieurs exécutions aux résultats
attendus distincts peuvent contribuer parallèlement au même ticket sans partager branche, worktree
ou état implicite.

```text
Execution
 `- Attempt 1 -> leased -> running
                           |- waiting_human
                           |- waiting_agent
                           |- verifying -> completed
                           `- failed / cancelled
 `- Attempt 2 -> ... (retry)
```

Chaque retry crée un nouvel `Attempt`, propriétaire de son worktree et de sa branche. Un `Attempt`
contient un `AgentRun` principal et peut contenir des `AgentRun` auxiliaires tracés, qui partagent
tous cet espace de travail. Le cycle technique (`leased`, `running`, `waiting_human`,
`waiting_agent`, `verifying`, `completed`, `failed`, `cancelled`), la `lease` et les réveils
appartiennent à l'`Attempt`. Le statut de l'`Execution` est une projection dérivée de ses tentatives,
jamais une seconde machine d'état. La réussite d'une exécution produit un rapport mais ne clôt
jamais automatiquement le ticket : un humain ou un agent autorisé le fait par une commande séparée
selon la politique du projet. Une approbation vise une action précise de l'exécution, réveille
l'`Attempt` concerné et reste visible depuis le ticket.

Le LLM ne modifie jamais directement ces états ni la base de données. Il appelle une commande typée,
le control plane vérifie les droits et les invariants, écrit l'événement, puis déclenche la suite.

À la frontière RPC, le client soumet une `CommandRequest` avec un `commandId`, une commande, son
payload et éventuellement l'événement qui l'a causée. Le control plane possède et ajoute
`projectId`, `actorId`, l'horodatage et la version de schéma. Il dérive la corrélation de la causalité
vérifiée, ou utilise `commandId` comme racine.

Commandes initiales envisagées :

- `ticket.create`
- `ticket.assign`
- `ticket.move`
- `ticket.complete`
- `ticket.reopen`
- `ticket.archive`
- `execution.start`
- `execution.retry`
- `agent.interrupt`
- `message.send`
- `question.ask`
- `report.submit`
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

Le client lit d'abord un snapshot cohérent avec son `EventCursor`, puis reprend un server stream
RPC filtré par projet. Le curseur est opaque, versionné et lié au projet. Le flux garantit l'ordre
et une livraison au moins une fois ; le client déduplique avec `eventId`. Le WebSocket est un
transport : une reconnexion reprend du dernier curseur, jamais de l'état du socket. Le polling du
journal est durable ; `LISTEN/NOTIFY` pourra accélérer le réveil sans devenir source de vérité.

Pour un premier déploiement sur un VPS :

- PostgreSQL stocke l'état, les événements et les leases ;
- les workers réclament un attempt avec verrouillage et expiration de lease ;
- `LISTEN/NOTIFY` peut accélérer le réveil, mais ne doit jamais être la source de durabilité ;
- toutes les commandes susceptibles d'être répétées ont une clé d'idempotence.

Prévoir une abstraction `WorkflowEngine`, implémentée dans PostgreSQL : leases avec expiration,
timers persistés et reprise après crash. Les attentes humaines et inter-agents sont des états de
l'`Attempt` (`waiting_human`, `waiting_agent`) réveillés par événement, jamais des processus bloqués
en mémoire. Cette machine à états des tentatives doit donc assumer elle-même retries, timeouts et
réveils différés ; le statut de l'`Execution` reste une projection de ses tentatives. Le port
`WorkflowEngine` protège un éventuel remplacement futur si les graphes d'exécutions deviennent trop
complexes.

## Forum et communication inter-agents

Le forum est une projection lisible de l'activité, pas le contexte brut du LLM.

Un message doit pouvoir référencer :

- `projectId` ;
- `ticketId` ;
- `executionId` ;
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

Cette médiation empêche les tempêtes de délégation, conserve l'audit et permet de suspendre une
exécution pendant une question.

Ne jamais injecter tout l'historique du forum dans un prompt. Construire un `ContextPack` versionné et
ciblé contenant seulement : ticket, résultat attendu de l'exécution, décisions pertinentes, résumé
des échanges, fichiers utiles et capacités disponibles. Pas de magasin mémoire externe (Mem0) : le
`ContextPack` se limite à l'état Noyau (ADR-0005).

## Intégration Hermes

Hermes est le premier adaptateur d'un port générique :

```ts
interface AgentRuntime {
  readonly start: (input: AgentRunInput) => Effect.Effect<RunHandle, AgentRuntimeError>

  readonly interrupt: (runId: AgentRunId) => Effect.Effect<void, AgentRuntimeError>

  readonly events: (runId: AgentRunId) => Stream.Stream<AgentEvent, AgentRuntimeError>
}
```

Noyau adresse une instance Hermes, pas un cluster : soit le processus tourne sur la même machine
que le serveur, soit il est joignable par Tailscale (ADR-0007). Chaque `Attempt` possède exactement
une branche et un worktree, partagés par tous ses `AgentRun`. Hermes peut isoler leurs processus ou
containers sur cet hôte, mais ne doit pas créer un espace de travail par `AgentRun`. Deux `Attempt`
distincts ne doivent jamais partager une branche ou un worktree. Utiliser l'API HTTP publique et
streamée d'Hermes plutôt que les WebSockets internes de son dashboard. Créer un MCP ou plugin Noyau
exposant uniquement les commandes autorisées aux agents.

Ne pas baser l'architecture de Noyau sur `delegate_task` : les sous-agents Hermes sont adaptés aux
sous-tâches temporaires mais pas à la collaboration durable souhaitée. Noyau doit lancer des runs
Hermes indépendants et considérer Hermes comme remplaçable.

Pour chaque `Attempt` :

- exiger un checkout ou `git worktree` dédié sur l'hôte Hermes ;
- utiliser une branche dédiée ;
- partager cet espace de travail entre l'`AgentRun` principal et ses `AgentRun` auxiliaires ;
- détruire ou archiver proprement l'espace de travail à la fin.

Pour chaque `AgentRun` :

- isoler le processus ou le container si nécessaire, sans créer de branche ni de worktree
  supplémentaire ;
- injecter un profil, un prompt et une liste de capacités versionnés ;
- limiter CPU, mémoire, durée, tokens et profondeur de délégation ;
- ne jamais monter le socket Docker dans l'environnement du run ;
- journaliser les appels d'outils en redigeant les secrets ;
- détruire proprement l'environnement d'exécution à la fin.

## Git et artefacts

Les dépôts d'un projet sont des dépôts GitHub (ADR-0006). Webhooks, pull requests et le port
`GitRuntime` parlent à GitHub ; pas d'autre forge en v1.

Un agent de code ne travaille jamais directement sur la branche principale.

Flux recommandé :

```text
Ticket
 -> Execution
 -> Attempt + worktree + branche dédiée
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
 -> revue humaine ou agent autorisé
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
- fournir un kill switch par run, exécution, ticket et projet ;
- versionner prompts, profils, modèles et manifestes d'outils ;
- conserver l'entrée exacte d'un run pour pouvoir l'évaluer ou l'expliquer, sans prétendre rejouer
  un LLM de manière déterministe.

## Structure de monorepo proposée

```text
apps/
  web/       # client web PWA
  server/    # frontière RPC, engine de commandes, reactors, scheduler

packages/
  domain/
  protocol/
  database/
  orchestration/
  agent-runtime/
  agent-hermes/
  git-runtime/
  n8n-gateway/
  policy/
  observability/
  testing/

infra/
  compose/
  migrations/
  images/
```

Ne pas créer tous les packages dès le premier commit. Introduire un package lorsqu'une frontière est
réelle et testée. Le premier socle se limite à `web`, `server`, `domain`, `protocol` et `database`.

Réservés au scénario de distribution, jamais créés en v1 : `infra/relay`, `apps/desktop`,
`apps/mobile` (ADR-0004).

## Première tranche verticale

Le premier objectif fonctionnel n'est pas « avoir tous les agents ». C'est ce parcours complet :

1. connecter un dépôt GitHub à un projet ;
2. poster une demande dans son channel ;
3. faire produire un plan typé par un profil orchestrateur configuré ;
4. créer directement deux tickets avec une dépendance sur le tableau du projet ;
5. lancer deux exécutions indépendantes dans des worktrees ;
6. laisser un agent poser une question visible dans l'interface ;
7. reprendre l'exécution après la réponse ;
8. exécuter formatage, lint, typecheck et tests ;
9. faire produire un rapport et un diff ;
10. proposer une pull request après approbation.

Ce scénario doit continuer à fonctionner après le redémarrage du serveur.

## Ordre d'implémentation recommandé

1. Configurations monorepo et conventions TypeScript/Effect.
2. Schémas `Project`, `Repository`, `Channel`, `Message`, `Ticket`, `Execution`, `Attempt` et
   configuration Kanban.
3. PostgreSQL, migrations, event log et outbox.
4. Frontière Effect RPC sur WebSocket : commandes, snapshots et flux d'événements.
5. Interface projet/channel/tableau Kanban minimale.
6. Port `AgentRuntime` et adaptateur Hermes (instance locale ou Tailscale) pour un run isolé.
7. Worktrees, artefacts, interruption et reprise.
8. Plan structuré par un profil orchestrateur, dépendances de tickets et scheduler d'exécutions.
9. Questions, rapports et approbations.
10. Review agent, tests et création de pull request.
11. Gateway n8n-dev puis promotion contrôlée.
12. Budgets, traces, évaluations, politiques avancées et hardening.

## Choix encore ouverts

Ces décisions doivent être prises au moment où elles deviennent nécessaires :

- stockage objet local/S3-compatible pour les artefacts ;
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
- Toute exécution autonome doit avoir un résultat attendu, un budget, une politique d'outils, un
  timeout et un kill switch.
- Toute fonctionnalité critique doit être testable sans appeler un vrai modèle LLM.
- Préférer une tranche verticale fonctionnelle à une arborescence exhaustive de packages vides.
