# @noyau/database

Couche de persistance de l'Environment local : journal append-only, receipts et projections sur
`node:sqlite`. Le SQL explicite passe par le `SqlClient` Effect, décodé par `Schema`
([ADR-0012](../../docs/adr/0012-sqlite-locale-et-txqueue.md)).

Le package expose l'adaptateur `node:sqlite`, les migrations statiques et un worker générique
auquel la composition serveur injecte decider, projector SQL et reactor. Il ne contient ni dialecte
PostgreSQL, ni outbox durable.

## Langage

**Journal d'événements**:
Suite append-only des faits autoritatifs de Noyau.
_À éviter_ : log applicatif, file de messages

**Receipt**:
Résultat durable d'une commande, rendu de façon stable à ses retries identiques.
_À éviter_ : réponse réseau, cache

**TxQueue**:
File mémoire des effets à remettre aux reactors **après** commit. Vide au boot.
_À éviter_ : outbox SQL, Queue comme source de vérité, PubSub

**Tête d'agrégat**:
Version durable qui ordonne et sérialise les décisions visant le même agrégat.
_À éviter_ : verrou applicatif, compteur global

**Projection Tableau**:
Vue SQL dérivée des colonnes, Tickets et dépendances d'un Project.
_À éviter_ : source de décision indépendante, état React

**Projection Thread**:
Vue SQL dérivée du Thread, de sa Session, de ses Turns et du transcript.
_À éviter_ : Channel, table de Message
