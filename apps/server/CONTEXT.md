# Server

Frontière de confiance de Noyau : elle transforme les intentions externes en commandes durables et
expose les projections et événements nécessaires aux clients. Le processus héberge aussi, à terme,
les reactors et le scheduler (ADR-0004).

## Langage

**CommandGateway**:
Frontière qui authentifie, enrichit et remet une `CommandRequest` au modèle de décision de Noyau.
_À éviter_ : contrôleur CRUD, mutation endpoint

**BoardSnapshot**:
Vue cohérente des colonnes et tickets actifs d'un projet accompagnée de l'`EventCursor`
représentant le même instant logique. Les exécutions sont chargées séparément à l'ouverture d'un
ticket.
_À éviter_ : liste de tâches, état d'exécution

**ProjectEventFeed**:
Suite ordonnée d'`EventEnvelope` d'un projet, livrée au moins une fois et reprise avec un
`EventCursor`.
_À éviter_ : WebSocket, bus d'événements

La frontière applicative est `ControlPlaneRpcs` sur WebSocket. En développement, le serveur fournit
l'acteur configuré par `NOYAU_DEV_ACTOR_ID` ; aucun identifiant choisi par le navigateur ne devient
une identité vérifiée.
