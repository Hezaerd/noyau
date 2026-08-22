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

**TextGeneration**:
Session ACP éphémère hors Turn, pour un Titre généré. Pas le `session/prompt` du Thread.
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
