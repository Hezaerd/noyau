# SQL explicite via @effect/sql-pg

Statut : accepté pour le SQL explicite — étendu à PGlite locale par l'ADR-0009.

La couche de persistance (event log append-only, receipts, outbox, leases) utilise `@effect/sql-pg`
(Effect v4, unstable, isolé derrière un port) avec du SQL explicite, décodé par `Schema` à la
frontière. Les migrations passent par le `Migrator` de `effect/unstable/sql` — pas de drizzle-kit ni
d'autre outil externe. Le profil VPS utilise `@effect/sql-pg` ; le profil local géré et les tests de
contrat utilisent `@effect/sql-pglite` pour rester sur le dialecte Postgres. La contention
multi-connexion reste vérifiée sur PostgreSQL réel.
