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
