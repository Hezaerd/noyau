# @noyau/domain

Langage métier de l'Environment local-first : Tableau, Tickets et conversations provider.

## Langage

**Environment**:
Autorité locale unique d'une installation : Projects, store et providers colocalisés.
_À éviter_ : Studio Server, Runtime Node, instance VPS

**Project**:
Dossier de travail relié à Noyau, possédant un Tableau et des Threads.
_À éviter_ : repository, workspace Git, Mission

**WorkspaceRoot**:
Chemin du dossier existant sur la machine où Noyau et Cursor travaillent. Un Thread `local` peut
y faire un `git checkout`.
_À éviter_ : worktree comme Project, sandbox, Attempt

**Checkout**:
Résultat durable lié au Thread : `worktreePath` (cwd) et `branch` (snapshot Noyau, pas le HEAD live).
_À éviter_ : rebind de Project, cwd du Ticket

**threadEnvMode**:
Choix de draft `local | worktree`. Matérialisé au premier `thread.turn.start`, pas à `thread.create`.
_À éviter_ : héritage depuis le Thread vu, mode persisté

**Tableau**:
Projection Kanban unique d'un Project, composée de colonnes ordonnées.
_À éviter_ : Board multiple, liste de tâches

**Colonne Done**:
Colonne terminale unique d'un Tableau. Identité native et protégée ; nom, couleur et position
configurables.
_À éviter_ : colonne ordinaire, statut de Ticket

**Ticket**:
Élément de travail durable et plat organisé sur un Tableau.
_À éviter_ : Task, Mission, checklist, unité d'exécution

**Dépendance Ticket**:
Relation orientée dans laquelle un Ticket dépend d'un autre ; l'ensemble forme un DAG.
_À éviter_ : sous-ticket, checklist, ordre de colonne

**TicketThread**:
Lien optionnel plusieurs-à-plusieurs entre un Ticket et un Thread du même Project.
_À éviter_ : sourceThreadId, Thread dédié, Workbench

**Thread**:
Conversation provider d'un Project, titrée, au Provider immuable.
_À éviter_ : Channel, Message, forum, Workbench

**Settle**:
Cycle qui recule un Thread de l'inbox. Override durable `settled | active` via
`thread.settle` / `thread.unsettle`. L'activité réelle (Turn start, Session
starting/running) remet l'override à `null`.
_À éviter_ : archive, snooze, status archived

**Session**:
Projection `0..1` du runtime provider sur un Thread (`status`, `lastError`, `resumeCursor`). Une
Session live peut servir plusieurs Turns ; la perte de son runtime ne crée pas une nouvelle
Session métier.
_À éviter_ : Execution, Attempt, AgentRun, ProviderBinding

**Turn**:
Unité append-only de travail agent dans un Thread. `latestTurn` vaut
`running | interrupted | completed | error`.
_À éviter_ : Attempt, requested, lost, failed

**TurnDiff**:
Résumé durable des fichiers touchés par un Turn, projeté sur ce Turn.
_À éviter_ : item de transcript, agrégat Git, diff ACP comme preuve

**runtimeMode**:
Politique d'outils du Thread :
`approval-required | auto-accept-edits | auto | full-access`.
_À éviter_ : permissionMode, AgentProfile

**modelSelection**:
Préférence durable du Thread pour le modèle Provider de ses prochains Turns. Elle peut inclure un
`reasoningEffort`, un `serviceTier` et une option `thinking`. Le dernier choix du Composer reste
attaché au Thread pour ses prochains Turns et reste distinct du modèle effectivement accepté par
une Session.
_À éviter_ : modèle de Session, capacité Provider

**defaultModelSelection**:
Préférence durable d'un Project pour initialiser le Provider et la `modelSelection` de ses nouveaux
Threads. L'absence live du Provider peut produire un fallback sans modifier cette préférence.
_À éviter_ : modèle de Session, défaut Environment, fallback durable

**Responsable**:
Acteur unique et optionnel qui porte la responsabilité principale d'un Ticket. Masqué de l'UI v0.1.
_À éviter_ : participant, exécutant

**Ticket archivé**:
Ticket retiré du Tableau actif tout en conservant son contenu, ses relations et son historique.
_À éviter_ : ticket supprimé, ticket terminé

**titleSeed**:
Titre provisoire du premier Turn, égal au prompt semé. Remplaçable tant qu'il n'a pas été renommé.
_À éviter_ : titre définitif, premier prompt comme nom

**Titre généré**:
Titre produit hors Turn par text-generation, persisté via `thread.title.seeded`.
_À éviter_ : titre du prompt, résumé du Turn

**Régénération de titre**:
Intention `thread.meta.update` avec `regenerateTitle` qui redemande un Titre généré depuis le transcript.
_À éviter_ : rename, `thread.title.seeded` client

**TurnImageAttachment**:
Meta d'une image jointe à un Turn, portée par `thread.turn.started` et `transcript.user`. Les
octets ne font pas partie du fait.
_À éviter_ : dataUrl, FilePreview, blob du journal

**Présentation de Turn**:
Discriminant optionnel recopié de `thread.turn.start` vers `transcript.user`. Le `text` reste le
prompt Provider.
_À éviter_ : inférer depuis le texte, Action palette
