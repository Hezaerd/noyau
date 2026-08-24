# Server

Frontière de confiance de l'Environment local : elle transforme les intentions du renderer en
commandes durables, possède SQLite et Cursor, et expose les streams RPC.

## Langage

**CommandGateway**:
Frontière qui reçoit une identité vérifiée par le transport, enrichit et remet une
`CommandRequest` au modèle de décision.
_À éviter_ : contrôleur CRUD, mutation endpoint

**dispatchCommand**:
Unique méthode client de soumission. Répond `{ sequence }` ou une erreur taguée.
_À éviter_ : mutation REST, IPC métier

**subscribeShell**:
Stream Environment : projects et thread shells, live coalescé.
_À éviter_ : liste HTTP, EventCursor par projet

**subscribeProject**:
Stream d'un Project : snapshot Board puis faits ticket / colonne, par événement.
_À éviter_ : liste de tâches, flux WebSocket brut

**subscribeThread**:
Stream d'un Thread : snapshot Session / Turns / transcript puis deltas de Turn.
_À éviter_ : Channel, SSE, GetTicketActivity

**commande interne**:
Ingestion provider (deltas ACP, tools, permissions, fin de Turn). Pas une intention renderer.
_À éviter_ : CommandRequest client, événement réseau brut

**AcpClient**:
Fil de fer `@noyau/acp` utilisé par l'adaptateur Cursor. Les extensions (`cursor/ask_question`)
restent ici.
_À éviter_ : schémas ACP maison, JSON-RPC maison

**MCP Noyau**:
Façade agent du control plane qui expose le Tableau et ses Tickets sans devenir une source de
vérité distincte.
_À éviter_ : TodoList agent, bridge SQLite, outil `dispatchCommand` brut

**Capacité MCP**:
Autorisation volatile et bornée d'un Turn Cursor sur un Project, un Thread et un ensemble
d'opérations Tableau.
_À éviter_ : bearer Electron, identité dans les arguments d'outil, permission `runtimeMode`

**catalogue Cursor**:
Capacité volatile découverte par `cursor/list_available_models`, qui expose les modèles et leurs
niveaux de raisonnement sans devenir un fait du journal.
_À éviter_ : projection durable, liste codée en dur

**workspace.searchPaths**:
Query RPC du `WorkspaceRoot` pour le picker `@` du Composer. Pas une Command, pas un fait du journal.
_À éviter_ : Command, listing Git, index durable

**TextGeneration**:
Session ACP éphémère hors Turn, pour un Titre généré, un nom de branche worktree ou un Draft Git. Pas le `session/prompt` du Thread.
_À éviter_ : Turn, ProviderPort.startTurn

**Branche temporaire**:
Ref `noyau/<8 hex>` créée au bind worktree. Remplacée au premier Turn par `noyau/<slug>` via `generateBranchName`. Le cwd du worktree ne change pas.
_À éviter_ : dériver du titre Thread, nanoid, rename du dossier

**setShellFocus**:
RPC volatile qui pousse la vue UI courante (Tableau ou Thread) pour les effets chrome. Pas une
Command, pas un fait du journal.
_À éviter_ : dispatchCommand, présence durable

**previewFile**:
Lecture sandboxée d'un fichier sous le WorkspaceRoot du Project, pour un FilePreview borné.
Pas une Command, pas un fait du journal.
_À éviter_ : openPath, IPC Desktop, lecture hors WorkspaceRoot

**Intégration agent**:
Skill portable qui apprend aux agents à employer le MCP Noyau. Son état appartient au
WorkspaceRoot et se constate sur le filesystem ; ce n’est ni une Command ni une projection.
_À éviter_ : préférence, événement d’installation, instructions ACP

**previewAttachment**:
Lecture sandboxée d'une TurnImageAttachment depuis le dossier Environment `attachments/`.
Pas une Command, pas un fait du journal.
_À éviter_ : previewFile, WorkspaceRoot, dataUrl dans le snapshot

**DiscordPresence**:
Activity Discord locale dérivée du ShellFocus. Application Discord distincte selon
`NOYAU_RELEASE_CHANNEL` (development / latest / nightly). Effet chrome : Discord fermé
ne casse jamais une commande.
_À éviter_ : événement Discord, agrégat, Join, résoudre sur `NOYAU_ENV`, une seule Application
pour les trois canaux

**PATH hôte**:
PATH du process Server, hydraté au boot depuis le login shell (macOS/Linux) ou le PATH
User+Machine (Windows). Sert Cursor, `git` et `gh`. Pas un fait du journal.
_À éviter_ : PATH figé dans le journal, sweep PATH, champ settings pour le PATH système

**GitRuntime**:
Port live `git` / `gh` du Server. Les lectures et mutations Git ne passent pas par le journal.
_À éviter_ : agrégat VCS, outbox SQL

**Pull request live**:
PR GitHub du HEAD, jointe par `gh pr list --head` sur le cwd du Checkout. Stream
`vcs.subscribeStatus` : snapshot local puis poll. Inclut la Mergeability (`mergeable` gh).
Pas un fait du journal.
_À éviter_ : pullRequestId, webhook, settle

**Publish**:
Création live d'un dépôt GitHub (`gh repo create`) puis câblage de `origin`. Hors journal.
_À éviter_ : sourceControl, wizard multi-forge

**GitPlane**:
Frontière RPC qui résout le cwd (`thread.worktreePath ?? WorkspaceRoot`) puis délègue à `GitRuntime`.
_À éviter_ : cwd choisi par le client

**EditorOpen**:
Port live qui sonde le PATH et lance un Éditeur hôte sur le cwd du Checkout. `file-manager`
utilise `open` (macOS), `explorer` (Windows) ou `xdg-open` (Linux).
_À éviter_ : openPath Desktop, GitRuntime

**Draft Git**:
Texte de commit ou de PR produit par `TextGeneration` à partir de `git status` / `diff` / `log`.
_À éviter_ : Turn, revue de PR
