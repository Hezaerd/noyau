# @noyau/database

Couche de persistance SQL du control plane : journal d'événements append-only, receipts
d'idempotence, outbox transactionnelle et projections lecture. PostgreSQL sert le profil VPS et
PGlite persistante le profil local géré ; le SQL explicite passe par le `SqlClient`
de `effect/unstable/sql`, décodé par `Schema` à la frontière (ADR-0001, ADR-0009).

## Contenu

> Les projections SQL `Ticket → Execution → Attempt` et Tableau portent l'unique modèle de travail.

| Module             | Rôle                                                                               |
| ------------------ | ---------------------------------------------------------------------------------- |
| `./board/store`    | Transaction Tableau, idempotence, projections Ticket/Execution et snapshot Kanban. |
| `./migrations`     | Journal, receipts, outbox, têtes et projections Ticket/Kanban via le Migrator.     |
| `./project-stream` | Lecture ordonnée du journal d'événements par projet.                               |

## Décisions structurantes

- **Une seule transaction** : receipt lookup → replay du journal → decider pur →
  `event + receipt + projection + outbox` dans le même `withTransaction`. Aucun état hors base.
- **Commande auditée avant décision** : la request canonique, son scope et la commande enrichie
  sont conservés. Un retry compare request + projet + acteur avant tout nouvel enrichissement ;
  même `commandId` avec un contenu ou un scope différent est un conflit.
- **Receipts historiques prudents** : un receipt antérieur au journal n'est rejoué que si son
  événement racine permet de vérifier request, projet, acteur et corrélation ; les cas ambigus
  deviennent des conflits et ne sont jamais réexécutés.
- **Rejet métier = receipt stable** : un rejet du decider (`TicketNotFound`, …) est
  persisté comme receipt `rejected` et rendu tel quel aux retries — jamais dans le canal
  d'erreur de l'exécution.
- **Décisions sérialisées par agrégat** : `aggregate_heads` verrouille
  `(project_id, aggregate_type, aggregate_id)` avant le replay et porte une version durable.
  Chaque événement reçoit une `aggregate_version` unique dans cet agrégat.
- **Tableau agrégé par projet** : les commandes Ticket/Kanban sont sérialisées sous
  `aggregate_type = 'board'` et `aggregate_id = projectId`, car les rangs, dépendances et
  invariants de clôture exigent l'état complet du Tableau.
- **Ordre de commit par projet** : `project_stream_heads` alloue sous verrou une
  `project_position` transactionnelle. Le `bigserial` de `events` reste interne et ne sert jamais
  de curseur, car une séquence PostgreSQL n'ordonne pas les commits.
- **Isolation projet stricte** : verrous, replay, projections et lectures incluent toujours
  `projectId`. Une entité d'un autre projet est invisible à la commande.
- **Snapshot cohérent** : Tableau et position du flux sont lus dans une transaction
  `REPEATABLE READ READ ONLY`, afin que le snapshot et son curseur décrivent le même état logique.
- **Port générique `SqlClient`** : ce package ne dépend d'aucun driver. `apps/server` fournit
  `@effect/sql-pg` pour le profil VPS ou `@effect/sql-pglite` pour le profil local géré ; les tests
  rapides utilisent aussi PGlite in-memory (même dialecte).
- **Horloge et UUID injectés** : `DateTime.now` (Clock) et `Crypto.randomUUIDv4` — pas de
  `now()` SQL ni de `crypto.randomUUID` en dur ; testable avec TestClock et un Crypto
  déterministe.
- **Colonnes d'agrégat génériques** (`aggregate_type`, `aggregate_id`) : le replay d'état charge
  les événements par agrégat ; d'autres agrégats (message, ticket, execution) réutiliseront le
  journal.

## Tests

`bun run test` — vitest + `@effect/vitest` sur PGlite in-memory : migrations historiques,
idempotence, causalité, isolation projet, versions, positions, snapshot et rejets stables. Les tests
de contrat du profil local doivent aussi couvrir une PGlite persistante ; ceux du control plane
exercent la contention multi-connexion sur PostgreSQL réel via Testcontainers.
