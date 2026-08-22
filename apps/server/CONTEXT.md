# Server

Frontière de confiance de l'Environment local : elle transforme les intentions du renderer en
commandes durables, possède SQLite et Cursor, et expose les streams RPC.

## Langage

**CommandGateway**:
Frontière qui authentifie via le bearer de lancement, enrichit et remet une `CommandRequest` au
modèle de décision.
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

**catalogue Cursor**:
Capacité volatile découverte par `cursor/list_available_models`, qui expose les modèles et leurs
niveaux de raisonnement sans devenir un fait du journal.
_À éviter_ : projection durable, liste codée en dur

**TextGeneration**:
Session ACP éphémère hors Turn, pour un Titre généré ou un Draft Git. Pas le `session/prompt` du Thread.
_À éviter_ : Turn, ProviderPort.startTurn

**setShellFocus**:
RPC volatile qui pousse la vue UI courante (Tableau ou Thread) pour les effets chrome. Pas une
Command, pas un fait du journal.
_À éviter_ : dispatchCommand, présence durable

**previewFile**:
Lecture sandboxée d'un fichier sous le WorkspaceRoot du Project, pour un FilePreview borné.
Pas une Command, pas un fait du journal.
_À éviter_ : openPath, IPC Desktop, lecture hors WorkspaceRoot

**DiscordPresence**:
Activity Discord locale dérivée du ShellFocus. Application Discord distincte selon `NOYAU_ENV`
(prod / dev). Effet chrome : Discord fermé ne casse jamais une commande.
_À éviter_ : événement Discord, agrégat, Join, une seule Application pour les deux envs

**GitRuntime**:
Port live `git` / `gh` du Server. Les lectures et mutations Git ne passent pas par le journal.
_À éviter_ : agrégat VCS, outbox SQL

**GitPlane**:
Frontière RPC qui résout le cwd (`thread.worktreePath ?? WorkspaceRoot`) puis délègue à `GitRuntime`.
_À éviter_ : cwd choisi par le client

**Draft Git**:
Texte de commit ou de PR produit par `TextGeneration` à partir de `git status` / `diff` / `log`.
_À éviter_ : Turn, revue de PR
