# Noyau — contexte d'architecture

Ce document décrit l'architecture active de Noyau et l'ordre de construction recommandé. La v1 est
définie par l'[ADR-0010](adr/0010-prioriser-la-boucle-ticket-v1.md) : elle priorise une boucle
Ticket complète avant toute surface agent.

## Vision

Noyau est le socle durable d'un LifeOS personnel. Sa première version permet de piloter les projets
depuis un client React distribué principalement comme application desktop.

Chaque projet peut disposer :

- d'un ou plusieurs dépôts GitHub associés ;
- d'un espace de discussion générique composé de `Channel`, `Thread` et `Message` ;
- d'un Tableau Kanban unique pour organiser des Tickets ;
- d'un historique système durable et autoritatif.

La v1 vise d'abord une boucle logique Trello-like : créer un Ticket avec un titre, enrichir ses
détails, le déplacer, relier ses dépendances, observer son activité, le terminer ou le rouvrir. La
description utilise GitHub Flavored Markdown (GFMD) ; priorité et échéance sont optionnelles.

La vision d'agents remplaçables, dont Hermes pourrait être un adaptateur, reste un horizon post-v1.
Elle ne définit actuellement ni entité active, ni surface UI, ni futur modèle d'exécution. Noyau
doit d'abord prouver son tracker et sa durabilité.

## Stack

- monorepo TypeScript 7 avec Bun comme package manager et runtime initial ;
- Vite+ comme toolchain unique, configuré dans le `vite.config.ts` racine ;
- Effect côté serveur et domaine lorsque ses erreurs typées, `Schema`, services et `Layer`
  apportent une frontière claire ;
- PostgreSQL comme source de vérité sur VPS et PGlite persistante comme implémentation embarquée du
  même dialecte pour le profil local géré ;
- renderer React avec Vite et TanStack Router dans `apps/web`, partagé entre navigateur et
  `Noyau Desktop` ;
- shell Electron introduit après validation de la frontière locale/distante, sans état métier
  autoritatif ;
- serveur unique `apps/server` sur Bun, avec Effect RPC sur WebSocket comme frontière client
  (ADR-0003) ;
- GitHub comme unique forge (ADR-0006).

Effect n'est pas imposé à l'état local ni au rendu React.

## Principe d'architecture

Noyau est un control plane durable construit d'abord comme un modular monolith :

```text
                    +-----------------------------+
                    |       Noyau Desktop         |
                    | renderer React + superviseur|
                    +--------------+--------------+
                                   |
                    Effect RPC sur WebSocket
                                   |
+--------------+       +-----------v------------+
|    GitHub    +------>|      Noyau Server      |
| webhooks     |       | commandes + projections|
+--------------+       | outbox + reactors      |
                       +-----------+------------+
                                   |
                            +------v-------+
                            | Store SQL    |
                            | PG ou PGlite |
                            +--------------+
```

Le flux autoritatif est :

```text
CommandRequest décodée
  -> Command enrichie par le serveur
  -> decider pur
  -> transaction SQL (event + receipt + projection + outbox)
  -> snapshot puis flux d'événements ordonné
```

Le store SQL reste la source de vérité. Une `Queue`, un `PubSub`, un WebSocket ou un état React ne
remplace jamais le journal, les projections et l'outbox transactionnelle.

## Topologie de déploiement

Noyau conserve une seule frontière client/serveur et deux profils de données (ADR-0009) :

1. **Distant** : `Noyau Desktop` charge son renderer local puis se connecte directement, via
   Tailscale Serve, à `noyau serve` sur un VPS possédant PostgreSQL.
2. **Local géré** : Electron lance et supervise le même `noyau serve` sur loopback. Le serveur
   possède seul une PGlite persistante. Le renderer utilise le même contrat RPC, les mêmes
   commandes, snapshots et curseurs que dans le profil distant.

Chaque serveur est une autorité indépendante avec une identité stable et sa propre base. Noyau ne
synchronise ni ne fédère les journaux de plusieurs instances. Les parties d'ADR-0009 concernant un
runtime agent ne font pas partie de la tranche v1 définie par ADR-0010.

## Responsabilités v1

### Noyau Server

Noyau Server possède :

- l'identité vérifiée de l'acteur à la frontière RPC ;
- les projets et leurs dépôts ;
- les `Channel`, `Thread` et `Message` génériques ;
- les colonnes, Tickets et dépendances du Tableau ;
- les commandes enrichies, événements, receipts, projections et l'outbox ;
- l'activité système autoritative de chaque Ticket.

Il sérialise les décisions visant un même Tableau, vérifie les invariants et ne fait confiance à
aucune métadonnée d'acteur fournie par le navigateur.

### Web

Le renderer présente les projections du serveur et soumet des intentions décodées. Il peut rejouer
des commandes réversibles de façon optimiste, mais le snapshot et les événements du serveur
restent autoritatifs.

Le responsable est conservé dans le modèle durable. Il n'est ni affiché ni éditable dans l'UI v1.

### Forum

`Channel`, `Thread` et `Message` restent des concepts génériques. Un Ticket peut référencer un
Thread d'origine par `sourceThreadId` et un Message peut être lié à un Ticket, mais aucun Thread
dédié n'est créé automatiquement. Le terme et la surface « Workbench » sont supprimés.

La conversation n'est pas l'audit. L'activité Ticket est une lecture autoritative des événements
pertinents, distincte de l'affichage des messages d'un Channel.

## Modèle de domaine v1

```text
Project
 |- Repository
 |- Channel
 |   `- Thread
 |       `- Message
 |- KanbanColumn
 `- Ticket
     `- TicketDependency
```

Le Tableau n'est pas une entité autonome : il est la projection ordonnée des colonnes, Tickets et
relations de dépendance d'un projet.

Le noyau SQL actif comprend :

- le journal d'événements, les receipts, les têtes d'agrégat et l'outbox ;
- les projections de colonnes et de Tickets ;
- les relations de dépendance Ticket ;
- les lectures de snapshot, de flux projet et d'activité Ticket.

Les identités importantes sont opaques et brandées. Toute donnée qui traverse une frontière de
processus ou de confiance est décodée avec `Effect.Schema`.

Les anciennes données pré-v1 n'imposent aucune compatibilité. Un reset ou une purge est accepté
pour supprimer les formes abandonnées plutôt que maintenir une migration artificielle.

## Ticket v1

Un Ticket est un élément de travail durable et plat. Il porte :

- un titre non vide, seul champ requis à la création ;
- une description optionnelle stockée comme texte et rendue en GFMD ;
- une priorité optionnelle : `low`, `normal`, `high` ou `urgent` ; l'absence est représentée par
  `none` dans la projection ;
- une échéance UTC optionnelle ;
- une colonne et un rang partagé ;
- un booléen `done`, un archivage optionnel et la dernière colonne active utile à la réouverture ;
- un responsable durable optionnel, masqué de l'UI v1 ;
- un `sourceThreadId` optionnel et immuable lorsqu'il vient d'une discussion ;
- des dépendances vers d'autres Tickets.

Un Ticket ne contient ni sous-ticket, ni checklist, ni todolist. Tout travail distinct devient un
Ticket relié. Il ne contient pas non plus de Workbench ou de cycle technique agent.

### Dépendances

La relation orientée `ticketId -> dependsOnTicketId` signifie que le premier Ticket est bloqué par
le second. Les relations doivent former un graphe acyclique dirigé :

- un Ticket ne dépend jamais de lui-même ;
- une relation ne peut pas être dupliquée ;
- tout ajout qui créerait un cycle est rejeté ;
- le Dialog permet d'éditer les deux lectures `Bloqué par` et `Bloque` ;
- un prérequis non terminé produit le badge dérivé `Bloqué` sur la carte ;
- terminer ou archiver malgré des prérequis ouverts exige une confirmation explicite ;
- aucune dépendance ne déplace automatiquement une carte.

### Cycle de vie

Chaque projet possède une colonne terminale `Done`, native et protégée. Son nom, sa couleur et sa
position restent configurables.

- Créer un Ticket dans `Done` est interdit.
- Déplacer un Ticket vers `Done` le termine.
- Sortir un Ticket de `Done` le rouvre.
- `ticket.complete` déplace vers `Done`.
- `ticket.reopen` restaure la dernière colonne active.
- Un Ticket archivé quitte le Tableau actif mais conserve son contenu, ses relations et son audit.
- Restaurer un Ticket le replace dans une colonne valide.
- La suppression d'une colonne référencée exige une destination active non terminale ; toutes les
  références sont retargetées dans la même décision.

L'ordre des Tickets est partagé et durable dans chaque colonne. Le client demande une position par
ancres voisines ; le domaine calcule le rang canonique.

## Commandes v1

Commandes publiques Ticket :

- `ticket.create`
- `ticket.update`
- `ticket.move`
- `ticket.complete`
- `ticket.reopen`
- `ticket.archive`
- `ticket.restore`
- `ticket.assign` — contrat durable, sans surface UI v1
- `ticket.dependency.add`
- `ticket.dependency.remove`

Commandes publiques de colonne :

- `kanbanColumn.create`
- `kanbanColumn.update`
- `kanbanColumn.move`
- `kanbanColumn.delete`

`board.initialize` est une commande système émise à la création d'un projet.

À la frontière RPC, le client choisit `commandId` et peut fournir un `causationId`. Le serveur ajoute
et vérifie `projectId`, `actorId`, `correlationId`, l'horodatage et la version de schéma. Chaque
retry strictement identique reçoit le receipt durable original ; réutiliser un `commandId` avec un
autre contenu ou scope est un conflit.

## Événements, activité et durabilité

PostgreSQL et PGlite utilisent le même journal append-only, les mêmes receipts, projections et
outbox transactionnelle. Dans une seule transaction, Noyau :

1. vérifie l'idempotence et la causalité ;
2. rejoue l'état de l'agrégat ;
3. exécute le decider pur ;
4. persiste événements, receipt, projection et outbox.

Les commandes du Tableau sont sérialisées sous l'agrégat projet, car l'ordre des colonnes et
Tickets ainsi que le DAG exigent une vue cohérente de l'ensemble.

Le client lit d'abord un `BoardSnapshot` cohérent avec son `EventCursor`, puis reprend un flux RPC
filtré par projet. Le curseur est opaque, versionné et lié au projet. Le flux est ordonné et livré
au moins une fois ; le client déduplique par `eventId`. Une reconnexion repart du dernier curseur,
jamais de l'état du WebSocket.

`GetTicketActivity` renvoie un historique borné des faits liés au Ticket, du plus récent au plus
ancien. Cette activité inclut les mutations du Ticket et de ses dépendances ; elle ne remplace ni
ne fusionne les conversations du Channel.

## UI du Tableau

La carte reste compacte : priorité, titre, échéance éventuelle et badge `Bloqué` dérivé. Aucun
responsable, checklist, état agent ou pourcentage inventé n'y apparaît.

Le Dialog Ticket suit strictement :

1. **Détails** : titre, priorité, échéance et description GFMD ;
2. **Dépendances** : `Bloqué par` et `Bloque`, éditables sous invariant de DAG ;
3. **Activité système** : audit autoritatif fourni par le serveur.

Les interactions optimistes sont une projection locale temporaire. Après acceptation, rejet ou
événement distant, le client recharge le snapshot autoritatif. Une file hors ligne et le replay de
commandes concurrentes restent différés.

La spécification détaillée est dans [`docs/design/kanban-ux.md`](design/kanban-ux.md).

## Agents et Hermes — horizon post-v1

Les agents, Hermes, l'orchestration, les budgets, les approbations agent et les espaces de travail
isolés sont différés. Les anciennes entités `Execution`, `Attempt` et `AgentRun` ne font partie ni
du protocole, ni du domaine, ni de la base, ni de l'UI v1.

ADR-0007 conserve l'historique des contraintes envisagées pour une intégration Hermes locale ou via
Tailscale. Il ne suffit pas à définir un contrat actif. Après validation de Ticket v1, le besoin
agent sera requalifié depuis les usages observés ; aucun modèle d'entités, de retries, de worktrees
ou de permissions n'est imposé maintenant.

Toute future intégration devra néanmoins préserver les invariants généraux :

- Noyau reste l'autorité durable ;
- les effets externes passent par des ports et des reactors idempotents ;
- les permissions ne sont jamais déduites d'un prompt ou d'un rôle affiché ;
- l'outbox SQL reste la source de reprise après crash ;
- le contenu externe est traité comme non fiable.

## Git, n8n et autres intégrations — horizon

Les dépôts d'un projet restent des dépôts GitHub (ADR-0006). Les automatisations n8n et les actions
Git avancées ne font pas partie de la première boucle Ticket. Lorsqu'elles seront introduites, elles
devront consommer l'outbox ou soumettre des commandes typées, rester idempotentes et ne jamais
posséder l'état métier.

## Structure active du monorepo

```text
apps/
  web/       # renderer React partagé
  server/    # frontière RPC et composition du control plane

packages/
  domain/    # deciders et projectors purs
  protocol/  # contrats Schema, RPC, commandes et événements
  database/  # journal, receipts, outbox et projections SQL
  config/    # configuration TypeScript partagée
```

`apps/desktop` sera introduit lorsque le même parcours RPC aura été validé contre PostgreSQL et
PGlite. Un package n'est créé que lorsqu'une frontière réelle et testée le justifie.

## Première tranche verticale

Le premier objectif fonctionnel est ce parcours durable :

1. initialiser le Tableau d'un projet avec `Backlog`, `En cours` et `Done` ;
2. créer un Ticket avec un titre dans une colonne non terminale ;
3. modifier son titre, sa description GFMD, sa priorité et son échéance ;
4. créer et retirer des dépendances sans permettre de cycle ;
5. afficher `Bloqué` tant qu'un prérequis reste ouvert ;
6. déplacer et réordonner le Ticket ;
7. terminer, rouvrir, archiver et restaurer le Ticket selon les invariants ;
8. consulter son activité système autoritative ;
9. reprendre le snapshot puis le flux projet après reconnexion.

Ce scénario doit continuer à fonctionner après redémarrage du serveur. Il ne dépend d'aucun agent.

## Ordre d'implémentation recommandé

1. Contrats `Project`, `Channel`, `Thread`, `Message`, `Ticket`, colonnes et dépendances.
2. Decider et projector purs du Tableau, y compris le DAG et la colonne `Done`.
3. Store SQL, migrations, journal, receipts, projections et outbox.
4. Frontière Effect RPC : soumission de commandes, snapshot, activité Ticket et flux projet.
5. Tableau React : colonnes, cartes, création, déplacement, recherche et filtre de priorité.
6. Dialog Ticket : Détails, Dépendances, Activité.
7. Archivage, restauration, accessibilité et réconciliation optimiste complète.
8. Profil PGlite persistant soumis aux mêmes migrations et contrats que PostgreSQL.
9. `Noyau Desktop` : renderer partagé et supervision du profil local.
10. Discussion générique et création d'un Ticket depuis un Thread source.
11. Réévaluation post-v1 des intégrations Git, n8n et agents à partir des usages réels.

## Choix encore ouverts

Ces décisions attendent un besoin de tranche verticale :

- stockage objet local ou S3-compatible ;
- système de secrets et credential broker ;
- forme éventuelle d'une intégration agent post-v1.

## Règles pour les agents qui travaillent sur le repo

- Lire ce document et les ADR applicables avant toute modification structurelle.
- Préserver le modular monolith tant qu'une séparation de déploiement n'est pas nécessaire.
- Faire passer toute donnée de frontière par un schéma runtime.
- Garder les deciders purs et les effets externes dans des reactors.
- Écrire les opérations externes de façon idempotente.
- Ne pas confondre Message, activité Ticket et événement de domaine.
- Ne pas réintroduire checklist, Workbench ou modèle agent sans nouvelle décision explicite.
- Préférer une tranche verticale fonctionnelle à des packages vides.
