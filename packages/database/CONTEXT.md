# @noyau/database

Couche de persistance SQL du control plane : journal d'événements append-only, receipts
d'idempotence, outbox transactionnelle et projections lecture. PostgreSQL sert le profil VPS et
PGlite persistante le profil local géré ; le SQL explicite passe par le `SqlClient`
de `effect/unstable/sql`, décodé par `Schema` à la frontière (ADR-0001, ADR-0009).

## Langage

**Journal d'événements**:
Suite append-only des faits autoritatifs de Noyau.
_À éviter_ : log applicatif, file de messages

**Receipt**:
Résultat durable d'une commande, rendu de façon stable à ses retries identiques.
_À éviter_ : réponse réseau, cache

**Outbox**:
File transactionnelle des effets à remettre à des reactors après la décision.
_À éviter_ : Queue en mémoire, PubSub

**Tête d'agrégat**:
Version durable qui ordonne et sérialise les décisions visant le même agrégat.
_À éviter_ : verrou applicatif, compteur global

**Projection Tableau**:
Vue SQL dérivée des colonnes, Tickets et dépendances d'un projet.
_À éviter_ : source de décision indépendante, état React

**Flux projet**:
Ordre durable des événements d'un projet depuis lequel un client peut reprendre.
_À éviter_ : connexion WebSocket, séquence SQL globale
