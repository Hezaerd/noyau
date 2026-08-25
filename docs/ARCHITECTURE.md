# Noyau — contexte d'architecture

Ce document décrit l'architecture **acceptée** de Noyau local-first v0.1
([ADR-0011](adr/0011-noyau-local-first-v0.1.md)). Les décisions vivent dans les tickets de
[Spécifier Noyau local-first v0.1](https://github.com/Hezaerd/noyau/issues/54) ; le repli qui gagne
en cas de conflit est [Replier les décisions v0.1 sur le modèle t3code](https://github.com/Hezaerd/noyau/issues/71).

**État du repo.** La spec est lockée. L'arbre actuel peut encore contenir le modèle précédent
(PostgreSQL / PGlite, outbox SQL, `Channel` / `Message`, `sourceThreadId`, Workbench). Ne pas
étendre ces formes. Les implémenter, les migrer ou les supprimer fait partie du rewrite v0.1, pas
d'une compatibilité à préserver.

## Vision

Noyau est un Environment desktop local de gestion de projet et de pilotage de coding agents,
calqué sur l'architecture t3code. Une installation possède une seule autorité : Noyau Server,
SQLite, les dossiers projet et Cursor sur la même machine.

La v0.1 vise ce parcours durable :

1. relier un dossier existant à un Project ;
2. atterrir sur le Tableau du projet ;
3. créer un Thread titré, choisir Cursor, streamer un Turn ;
4. lier optionnellement ce Thread à un Ticket ;
5. redémarrer l'application et retrouver le Tableau, le Thread, le transcript et `lastError` ;
6. poursuivre par un nouveau Turn (`session/load`), sans rejouer le prompt.

Cible de sortie : macOS et Windows natif. Linux, WSL, client web distribué et mobile sont différés.

## Stack

- monorepo TypeScript 7, Bun comme package manager ;
- Vite+ comme toolchain unique, configuré dans le `vite.config.ts` racine ;
- Effect côté serveur et domaine lorsque `Schema`, services et `Layer` portent une frontière ;
- `node:sqlite` comme unique store v0.1 ([ADR-0012](adr/0012-sqlite-locale-et-txqueue.md)) ;
- renderer React dans `apps/web`, partagé par `Noyau Desktop` ;
- `apps/desktop` : Electron supervise le serveur enfant (`ELECTRON_RUN_AS_NODE`) ;
- `apps/server` : même bundle que l'entrée autonome `noyau serve` ;
- Effect RPC sur WebSocket loopback ([ADR-0003](adr/0003-frontiere-client-effect-rpc-websocket.md)) ;
- MCP HTTP loopback embarqué pour exposer le Tableau aux agents
  ([ADR-0015](adr/0015-tableau-accessible-aux-agents-par-mcp.md)) ;
- skill `noyau` installable explicitement dans chaque WorkspaceRoot pour enseigner aux agents les
  pratiques du Tableau ([ADR-0016](adr/0016-skill-noyau-installe-par-project.md)) ;
- Cursor ACP local comme unique provider réel ([ADR-0018](adr/0018-runtime-cursor-porte-par-la-session.md)).
  Le fil de fer ACP est `@noyau/acp` ([ADR-0014](adr/0014-fil-de-fer-acp.md)), pas un port
  multi-harnais.

Effect n'est pas imposé à l'état local ni au rendu React.

## Principe d'architecture

Noyau reste un modular monolith. La frontière client/serveur est la seule contrainte conservée
pour un futur distant ; elle n'ouvre aucun profil VPS en v0.1.

```text
Noyau Desktop (Electron main)
  └─ Noyau Server enfant (Node)
       ├─ SQLite (journal, receipts, projections)
       ├─ WorkspaceRoot des Projects
       ├─ runtimes Cursor ACP des Sessions (un processus par Session live, handle + Scope)
       ├─ MCP HTTP (capacités agent bornées)
       └─ transcripts et resumeCursor

Renderer React
  └─ Effect RPC WebSocket loopback ──► Noyau Server
```

Le flux autoritatif est :

```text
CommandRequest décodée
  -> Command enrichie (acteur hors payload)
  -> decider pur
  -> transaction SQLite (event + receipt + projection)
  -> swap du read model, publish
  -> reactors TxQueue (effets provider, après commit)
  -> snapshot puis flux (subscribeShell / subscribeProject / subscribeThread)
```

Le journal SQLite et les receipts portent la durabilité. Une `Queue` ou un `PubSub` n'est jamais
une source de vérité. La `TxQueue` n'est pas une outbox de reprise : au boot elle est vide.

## Topologie

Un profil Electron possède un seul Environment, partagé par ses fenêtres.

- Electron lance le bundle serveur, lui transmet par fd3 le répertoire de données OS, un port
  loopback éphémère, un token bearer propre au lancement et la version du bootstrap.
- Le renderer n'utilise que l'Effect RPC pour le métier. Le preload reste limité aux capacités
  desktop. Aucun raccourci IPC métier.
- L'application n'est prête qu'après migrations SQLite, reconstruction des projections, passe de
  recovery Session, démarrage des reactors et probe RPC.
- Le serveur suit Electron : backoff borné, état `degraded` après échecs répétés, arrêt interne
  puis `forceKillAfter` 2 s. Quitter arrête le serveur enfant sans confirmation.
- Un Project référence un dossier déjà présent sur la machine. Noyau et Cursor y travaillent
  directement. Worktrees obligatoires et provenance Git par Turn sont différés.
- L'acteur v0.1 est local, bootstrapé. Le token de lancement accorde tous les scopes déclarés.
- Le mode dev peut lancer le serveur à part pour le hot reload, avec le même bootstrap, SQLite
  et RPC. Un smoke test couvre le vrai child Electron.

Les releases unsigned latest/nightly (DMG arm64, NSIS x64) sont décrites dans
[ADR-0017](adr/0017-releases-unsigned-latest-nightly.md). L’auto-update Electron, la signature et
la réparation du serveur enfant restent un effort ultérieur.

## Responsabilités v0.1

### Noyau Server

Noyau Server possède :

- l'Environment local et l'identité de l'acteur à la frontière RPC ;
- les Projects, leur `WorkspaceRoot`, le Tableau et les Tickets ;
- les Threads, Turns, Sessions projetées et transcripts ;
- les commandes enrichies, événements, receipts et projections ;
- l'adaptateur Cursor et les runtimes Cursor des Sessions (processus, `AcpClient`, handle +
  `Scope`) ;
- le serveur MCP HTTP, ses capacités volatiles bornées et ses toolkits Tableau ;
- les reactors `TxQueue` pour les effets provider.
- l’inspection et l’installation explicite de l’Intégration agent dans le WorkspaceRoot, sans en
  faire un état SQLite.

Il sérialise les décisions sous un worker unique. Il ne fait confiance à aucune métadonnée
d'acteur fournie par le renderer.

### Noyau Desktop

Electron est client et superviseur. Il ne possède ni SQLite, ni transcript, ni handle
`cursor-agent`. Il connaît le PID du serveur. Après mort du serveur, pas de sweep d'orphelins.

### Web

Le renderer présente les projections et soumet des `CommandRequest`. Tableau-first : au restart,
le Tableau du dernier projet. Sidebar = Threads titrés. `lastError` est visible. Le lien
Ticket–Thread est éditable aux deux bouts.

Le responsable reste dans le modèle Ticket. Il n'est ni affiché ni éditable dans l'UI v0.1.

### Cursor

Détection : `cursor-agent` dans le `PATH` (`cursor-agent.exe` sous Windows), sinon chemin
configuré. Au boot, le Server hydrate ce PATH depuis le login shell (GUI Electron). Le
handshake ACP est la source de vérité. Capacités obligatoires absentes → provider
inactif, y compris MCP HTTP. Noyau injecte son endpoint et une capacité dédiée dans
`session/new` et `session/load` ; aucun fallback stdio. Credentials Cursor restent locaux. Usage
promis absent du contrat v0.1.

## Modèle de domaine v0.1

```text
Environment
└─ Project*
   ├─ WorkspaceRoot
   ├─ Board (projection unique)
   │  └─ Ticket*
   │       └─ TicketDependency*
   └─ Thread*
      ├─ title
      ├─ Provider (immuable, cursor)
      ├─ runtimeMode
      ├─ Session?
      └─ Turn* (append-only, latestTurn)

Ticket * ── TicketThread(ticketId, threadId) ── * Thread
```

Le Tableau n'est pas une entité autonome : c'est la projection ordonnée des colonnes, Tickets et
dépendances d'un Project.

`Channel`, `Message`, Workbench, `Execution`, `Attempt` et `AgentRun` ne font pas partie du
modèle actif. Un Thread n'est pas une discussion de forum : c'est une conversation provider.

Les identités importantes sont opaques et brandées. Toute donnée de frontière est décodée avec
`Effect.Schema`.

## Ticket

Un Ticket est un élément de travail durable et plat. Il porte :

- un titre non vide, seul champ requis à la création ;
- une description optionnelle, texte rendu en GFMD ;
- une priorité optionnelle : `low`, `normal`, `high` ou `urgent` ; l'absence vaut `none` ;
- une échéance UTC optionnelle ;
- une colonne et un rang partagé ;
- un booléen `done`, un archivage optionnel et la dernière colonne active ;
- un responsable durable optionnel, masqué de l'UI v0.1 ;
- des dépendances vers d'autres Tickets ;
- des liens optionnels `TicketThread` (plusieurs-à-plusieurs). Plus de `sourceThreadId` immuable.

Un Ticket ne contient ni sous-ticket, ni checklist, ni todolist, ni état agent. Tout travail
distinct devient un Ticket relié. L'état agent vit sur le Thread / la Session.

### Dépendances

La relation `ticketId -> dependsOnTicketId` signifie que le premier Ticket est bloqué par le
second. L'ensemble forme un DAG : pas d'auto-dépendance, pas de doublon, pas de cycle. Le Dialog
édite `Bloqué par` et `Bloque`. Un prérequis ouvert produit le badge `Bloqué`. Terminer malgré
des prérequis ouverts exige une confirmation. Aucune dépendance ne déplace une carte.

### Cycle de vie

Chaque projet a une colonne terminale `Done`, native et protégée. Nom, couleur et position restent
configurables.

- Créer dans `Done` est interdit.
- Déplacer vers `Done` termine. Sortir de `Done` rouvre.
- `ticket.complete` / `ticket.reopen` suivent ces invariants.
- Un Ticket archivé quitte le Tableau actif. Restaurer le replace dans une colonne valide.

L'ordre des Tickets est partagé et durable. Le client demande une position par ancres ; le
domaine calcule le rang canonique.

Le détail UX reste dans [`docs/design/kanban-ux.md`](design/kanban-ux.md).

## Thread, Session et Turn

- **Thread** : titre obligatoire (seed = premier prompt, régénération t3code). Provider fixé à la
  création. `runtimeMode` :
  `approval-required | auto-accept-edits | auto | full-access` (défaut `full-access`).
  Statut `active | archived`. Un Thread archivé doit être restauré avant un nouveau Turn.
- **Session** : projection `0..1`. `status` :
  `idle | starting | running | ready | interrupted | stopped | error`, plus `lastError`,
  `activeTurnId`, `runtimeMode`, `resumeCursor`. Le runtime ACP vivant est une ressource volatile
  possédée par la Session ; son absence après un restart, un arrêt, un crash ou un reaper ne crée
  pas une nouvelle Session.
- **Turn** : append-only. Un seul Turn actif par Thread. `latestTurn.state` =
  `running | interrupted | completed | error`. Settlement = la Session quitte `running`
  (`ready`/`idle` → `completed` ; `error` → `error` ; `interrupted`/`stopped` → `interrupted`).
- **`resumeCursor`** : `{ schemaVersion: 1, sessionId }`. Opaque. `schemaVersion` ≠ 1 ou load en
  échec → `session/new` en place. Pas de `cwdLastBound`.
- **Transcript** : projection du Turn. Chaque réception normalisée est un fait persisté dès
  arrivée. Un Turn terminal n'est jamais réécrit. Images rejetées (coupe v0.1).
- **Runtime Cursor** : une Session live possède au plus un subprocess `cursor-agent acp`, son
  `AcpClient`, son handle et son `Scope`. Le runtime est créé paresseusement au premier Turn ou
  après sa perte, puis le même client sert les Turns suivants ; un Turn terminé ne ferme pas le
  runtime. Les appels `session/new`, `initialize` et `authenticate` ne sont donc pas rejoués
  entre deux Turns normaux.
- **Reprise** : après restart du Server, crash du process, `session.stop` ou reaper, le prochain
  Turn recrée un runtime et utilise `session/load` avec le `WorkspaceRoot` courant et le
  `resumeCursor` persistant. Un load impossible peut basculer vers `session/new` ; cela ne rejoue
  aucun prompt historique. Seul le mandat du Turn courant est envoyé lorsqu'un nouveau contexte
  doit être créé. `end_turn` seul complète. Autre `stopReason` → `interrupted`. Rupture stdio /
  process mort → Session `error` + `lastError`. Jamais `completed` par inférence.
- **Arrêt et reaper** : `session.stop` ferme explicitement le runtime et passe la Session à
  `stopped`. Un reaper ferme le runtime des Sessions sans Turn actif après la durée d'inactivité
  opérationnelle (30 minutes par défaut, comme t3code), mais ne persiste aucun statut : la
  Session ne passe pas à `stopped`. Le prochain Turn reste reprenable par `session/load`. Aucun
  reaper ne touche un Turn actif.
- **Boot** : avant readiness, sans I/O Cursor, toute Session encore `starting` / `running` →
  `error` + `lastError` (rupture). Ça settle `latestTurn` en `error`. `resumeCursor` inchangé ; le
  runtime ne réapparaît qu'à la demande d'un nouveau Turn.
- **Appartenance process** : handle capturé au spawn, lié au `Scope` détenu par la Session. Toute
  fermeture de runtime agit sur ce handle (`child.kill()`) et ferme son Scope. Pas de sweep
  d'orphelins, pas de scan par nom, pas de processus Cursor partagé entre Sessions.

Mapping Cursor de `runtimeMode` : `approval-required` essaie `ask` puis implement. `full-access`
auto-répond `allow_always` / `allow_once`. La politique locale Cursor reste un niveau inférieur.
L'UI expose les quatre valeurs.

Un Project indisponible refuse la commande. `session.stop` arrête la Session.

## Commandes v0.1

À la frontière : une méthode `orchestration.dispatchCommand`. `commandId` brandé, receipt
durable. Accepté → `{ sequence }`. Rejeté → erreur taguée, même erreur au retry. Réutiliser un
`commandId` sur un autre agrégat est un conflit.

Commandes client :

- Project : create, meta, rebind, delete ;
- Tableau : colonnes et Tickets (create / update / move / complete / reopen / archive / restore,
  dépendances) ;
- Thread : create, archive, meta, `runtimeMode`, `modelSelection` ;
- Turn : `thread.turn.start`, `thread.turn.interrupt` ;
- `approval.respond`, `user-input.respond`, `session.stop`.

`ticket.assign` reste un contrat durable sans surface UI.

Hors contrat : checkpoints, diffs, snooze, pin, settle, terminal, pairing, relay, usage.

Les deltas ACP, tool updates, permissions et fins de Turn sont des **commandes internes**
(ingestion). Le renderer ne les soumet pas.

Les outils MCP Tableau ne soumettent que des `CommandRequest` publiques autorisées par leur
capacité. Ils passent par le même `CommandGateway` que le renderer et ne peuvent pas émettre de
commande interne.

## Durabilité

`node:sqlite`, WAL, un seul possesseur. Migrations `Migrator` Effect, SQL numéroté, au boot
**avant** recovery. Échec de migration → pas de readiness.

Dans une transaction :

1. vérifier l'idempotence ;
2. rejouer l'état de l'agrégat ;
3. exécuter le decider pur ;
4. persister événements, receipt et projection.

Après commit : swap du read model, publish, puis reactors `TxQueue`. Les appels Cursor
(`session/new`, `load`, `prompt`, `cancel`, réponses) partent du reactor d'intent.

Sauvegarde : copie unique `db` + `-wal` + `-shm` avant une update ; snapshot à chaud par
`VACUUM INTO`.

## RPC et flux

Après readiness : upgrade WebSocket avec le bearer de lancement. L'acteur vient du middleware,
pas du payload. Connecté = socket ouverte **et** `server.getConfig` OK. `server.probe` pour les
wakeups.

Trois server streams, protocole t3code (`snapshot` | `event` | `synchronized`) :

| Méthode | Snapshot | Live |
| --- | --- | --- |
| `subscribeShell` | Environment : projects + thread shells | upsert/remove légers, coalescé |
| `subscribeProject(projectId)` | Board + tickets / colonnes | faits ticket / colonne, par événement |
| `subscribeThread(threadId)` | Thread + Turns + transcript | deltas de Turn, par événement |

Curseur : `afterSequence` numérique global, pas un `EventCursor` opaque par projet. Gap `< 0`
ou `> 1000` → snapshot frais. Live buffer attaché avant snapshot / catch-up. Le client déduplique
par `sequence`.

`getConfig` annonce les versions bundle / serveur / schéma DB. Desktop et `server.asar` sont
livrés ensemble : un mismatch est un diagnostic, pas une négociation de protocole.

Le WebSocket n'est jamais la source du curseur. Transport down → le superviseur client remplace
la session RPC. Une erreur métier ne démonte pas le transport.

L'activité Ticket est la lecture des faits Ticket persistés. Elle ne fusionne pas le transcript
d'un Thread.

## MCP Tableau

Noyau Server monte `/mcp` avec `McpServer.layerHttp` sur son listener loopback. Avant une Session
Cursor, il émet une capacité volatile dont seul le hash reste en mémoire ; le contexte associé
borne l'agent à son Project, son Thread, sa Session et ses opérations autorisées. Le bearer
survit entre les Turns, mais `resolve` exige un Turn actif : `/mcp` répond 401 hors Turn. Ce
Turn complète le contexte pour borner les mutations et l'audit. Le secret brut est injecté comme
bearer dans la configuration MCP HTTP d'ACP.

Les lectures interrogent les projections dans le process serveur. Les mutations décodent leurs
arguments, construisent une commande publique idempotente et passent par le `CommandGateway`. Le
finalizer du runtime provider de la Session révoque la capacité ; une expiration borne les arrêts
anormaux. Le registre est vide au boot. Cursor sans capability MCP HTTP est inactif et Noyau ne
fournit pas de fallback stdio.

`noyau_ask_question` (capacité `thread:ask`) est le canal HITL portable : il bloque jusqu'à
`user-input.respond` et partage le même `transcript.user-input` que `cursor/ask_question`
([ADR-0016](adr/0016-canal-hitl-questionnaire.md)).

## UI

- Tableau-first. Sidebar = Threads titrés. Restart = Tableau du dernier projet.
- Carte Ticket : priorité, titre, échéance, badge `Bloqué`. Pas de responsable, pas d'état agent.
- Dialog Ticket : Détails, Dépendances, Threads liés, Activité système.
- Session `error` : `lastError` visible. Interrupt humain : `interrupted` (« You stopped »).
  Plus de badge `lost`.
- Relier un dossier existant. Un Thread `local` peut `git checkout` dans ce `WorkspaceRoot` ;
  un `worktree` se matérialise au premier Turn ([ADR-0015](adr/0015-checkout-thread-et-git-live.md)).

Les interactions optimistes restent une projection locale temporaire. Après acceptation, rejet
ou événement distant, le snapshot autoritatif gagne.

## Hors périmètre v0.1

- Studio Server, Runtime Nodes, VPS, connexion distante, fédération d'Environments ;
- comptes, pairing, permissions projet, présence ;
- Claude, Codex, harnais générique, usage promis ;
- checkpoints, provenance Git par Turn, inbox PR / reviews / checks t3code ;
- n8n, terminal intégré ;
- Linux, WSL, client web distribué, mobile ;
- packaging / MAJ / réparation desktop (effort suivant) ;
- migration des bases PostgreSQL / PGlite actuelles.

## Structure du monorepo

```text
apps/
  web/       # renderer React partagé
  server/    # frontières RPC/MCP et composition du control plane
  desktop/   # Electron : superviseur + chrome, sans état métier

packages/
  domain/    # deciders et projectors purs
  protocol/  # contrats Schema, RPC, commandes et événements
  database/  # journal SQLite, receipts, projections
  acp/       # fil de fer ACP (codegen spec + AcpClient)
  shared/    # helpers purs composer (trigger, mentions)
  config/    # configuration TypeScript partagée
```

Un package n'est créé que lorsqu'une frontière réelle et testée le justifie.

## Ordre d'implémentation

1. Contrats et deciders : Environment, Project, Board, Ticket, Thread, Session, Turn,
   `TicketThread`.
2. Store `node:sqlite` : txn event + receipt + projection, `TxQueue`, WAL, Migrator.
3. Electron + serveur Node : fd3, readiness, backoff / `degraded`, grâce 2 s.
4. RPC : `dispatchCommand`, `subscribeShell` / `subscribeProject` / `subscribeThread`.
5. Adaptateur Cursor ACP : runtime porté par la Session, handshake, `session/new` / `load`,
   `startTurn` réutilisé, reaper et mapping `runtimeMode`.
6. MCP HTTP : capacités bornées, outils Tableau et injection Cursor.
7. UI Tableau-first, sidebar Threads, `lastError`, lien Ticket–Thread, reprise après restart.

## Choix encore ouverts

Attendent un effort ultérieur, pas cette coupe :

- packaging, installation, mise à jour, logs et réparation du serveur enfant ;
- stockage objet ;
- secrets / credential broker au-delà du token de lancement ;
- forme d'un futur Environment distant.

## Règles pour les agents qui travaillent sur le repo

- Lire ce document et les ADR applicables avant toute modification structurelle.
- En cas de conflit entre un ticket wayfinder et un autre, le repli [#71](https://github.com/Hezaerd/noyau/issues/71) gagne.
- Préserver le modular monolith et la frontière RPC. Pas d'IPC métier.
- Garder les deciders purs. Les effets Cursor partent des reactors après commit.
- Ne pas traiter la `TxQueue` comme une outbox de reprise.
- Ne pas réintroduire `Channel`, `Message`, Workbench, `Execution`, `Attempt`, outbox SQL,
  PGlite, Hermes ou un sweep d'orphelins.
- Ne pas étendre les formes encore présentes dans le code si elles contredisent cette spec.
