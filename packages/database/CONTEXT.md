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
- **Rejet métier = receipt stable** : un rejet du decider (`InvalidTaskTransition`, …) est
  persisté comme receipt `rejected` et rendu tel quel aux retries — jamais dans le canal
  d'erreur de l'exécution.
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
