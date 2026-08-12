# @noyau/database

Couche de persistance PostgreSQL du control plane : journal d'événements append-only, receipts
d'idempotence, outbox transactionnelle et projections lecture. SQL explicite via le `SqlClient`
de `effect/unstable/sql`, décodé par `Schema` à la frontière (ADR 0001).

## Contenu

| Module         | Rôle                                                                       |
| -------------- | -------------------------------------------------------------------------- |
| `./migrations` | Tables `events`, `receipts`, `outbox`, `tasks` via le `Migrator` d'Effect. |
| `./receipt`    | Schémas `Receipt` / `ReceiptResponse` (accepted ou rejected).              |
| `./task/store` | `executeTaskCommand` : la transaction unique. `readTask` : projection.     |

## Décisions structurantes

- **Une seule transaction** : receipt lookup → replay du journal → decider pur →
  `event + receipt + projection + outbox` dans le même `withTransaction`. Aucun état hors base.
- **Commande auditée avant décision** : la request canonique, son scope et la commande enrichie
  sont conservés. Un retry compare request + projet + acteur avant tout nouvel enrichissement ;
  même `commandId` avec un contenu ou un scope différent est un conflit.
- **Rejet métier = receipt stable** : un rejet du decider (`InvalidTaskTransition`, …) est
  persisté comme receipt `rejected` et rendu tel quel aux retries — jamais dans le canal
  d'erreur de l'exécution.
- **Décisions sérialisées par agrégat** : `aggregate_heads` verrouille
  `(project_id, aggregate_type, aggregate_id)` avant le replay et porte une version durable.
  Chaque événement reçoit une `aggregate_version` unique dans cet agrégat.
- **Ordre de commit par projet** : `project_stream_heads` alloue sous verrou une
  `project_position` transactionnelle. Le `bigserial` de `events` reste interne et ne sert jamais
  de curseur, car une séquence PostgreSQL n'ordonne pas les commits.
- **Isolation projet stricte** : verrous, replay, projections et lectures incluent toujours
  `projectId`. Une entité d'un autre projet est invisible à la commande.
- **Snapshot cohérent** : tâches et position du flux sont lues dans une transaction
  `REPEATABLE READ READ ONLY`, afin que le snapshot et son curseur décrivent le même état logique.
- **Port générique `SqlClient`** : ce package ne dépend d'aucun driver. `@effect/sql-pg`
  arrivera avec `apps/control-plane` ; les tests utilisent `@effect/sql-pglite` (même dialecte).
- **Horloge et UUID injectés** : `DateTime.now` (Clock) et `Crypto.randomUUIDv4` — pas de
  `now()` SQL ni de `crypto.randomUUID` en dur ; testable avec TestClock et un Crypto
  déterministe.
- **Colonnes d'agrégat génériques** (`aggregate_type`, `aggregate_id`) : le replay d'état charge
  les événements par agrégat ; d'autres agrégats (message, mission) réutiliseront le journal.

## Tests

`bun run test` — vitest + `@effect/vitest` sur pglite in-memory : happy path, idempotence des
receipts, rejet stable, replay multi-événements.
