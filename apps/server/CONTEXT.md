# Server

Frontière de confiance de Noyau : elle transforme les intentions externes en commandes durables et
expose les projections et événements nécessaires aux clients. Le processus héberge aussi, à terme,
les reactors et le scheduler (ADR-0004).

## Langage

> État d'implémentation : `ProjectTaskSnapshot` expose encore la projection antérieure à
> l'ADR-0008. La future frontière publiera un snapshot du tableau et des tickets séparé des états
> d'exécution.

**CommandGateway**:
Frontière qui authentifie, enrichit et remet une `CommandRequest` au modèle de décision de Noyau.
_À éviter_ : contrôleur CRUD, mutation endpoint

**ProjectTaskSnapshot**:
Vue cohérente des tâches d'un projet accompagnée de l'`EventCursor` représentant le même instant
logique.
_À éviter_ : liste de tâches, état courant

**ProjectEventFeed**:
Suite ordonnée d'`EventEnvelope` d'un projet, livrée au moins une fois et reprise avec un
`EventCursor`.
_À éviter_ : WebSocket, bus d'événements
