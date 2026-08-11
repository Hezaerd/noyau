# SQL explicite via @effect/sql-pg

La couche de persistance (event log append-only, receipts, outbox, leases) utilise `@effect/sql-pg`
(Effect v4, unstable, isolé derrière un port) avec du SQL explicite, décodé par `Schema` à la
frontière. Les migrations passent par le `Migrator` de `effect/unstable/sql` — pas de drizzle-kit ni
d'autre outil externe. Les tests utilisent `pglite` pour rester sur le dialecte Postgres.
