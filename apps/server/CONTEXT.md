# Server

Frontière de confiance de Noyau : elle transforme les intentions externes en commandes durables et
expose les projections et événements nécessaires aux clients. Le processus héberge aussi, à terme,
les reactors et le scheduler (ADR-0004).

## Langage

**CommandGateway**:
Frontière qui authentifie, enrichit et remet une `CommandRequest` au modèle de décision de Noyau.
_À éviter_ : contrôleur CRUD, mutation endpoint

**BoardSnapshot**:
Vue cohérente des colonnes, tickets et relations du DAG d'un projet accompagnée de l'`EventCursor`
représentant le même instant logique.
_À éviter_ : liste de tâches

**TicketActivity**:
Historique borné des faits Ticket autoritatifs, ordonné du plus récent au plus ancien.
_À éviter_ : journal SQL, flux projet

**ProjectEventFeed**:
Suite ordonnée d'`EventEnvelope` d'un projet, livrée au moins une fois et reprise avec un
`EventCursor`.
_À éviter_ : WebSocket, bus d'événements
