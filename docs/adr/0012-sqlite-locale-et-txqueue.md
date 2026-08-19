# Durabilité SQLite locale et TxQueue

> **Statut : accepté.** Remplace le choix PostgreSQL / PGlite / outbox SQL de
> [l'ADR-0001](0001-sql-explicite-effect-sql-pg.md) pour la v0.1. Le SQL explicite, le décodage
> `Schema` et le `Migrator` Effect restent en vigueur. Source :
> [Fixer la durabilité SQLite de l'Environment local](https://github.com/Hezaerd/noyau/issues/61).

L'Environment local utilise le moteur t3code sur `node:sqlite` : un worker sérialise les commandes,
le decider reste pur, une transaction append le journal, la projection et le receipt. Après commit,
le read model mémoire est swappé et les reactors partent. Les pragmas sont `WAL`, `busy_timeout=5000`
et `foreign_keys=ON`. Un seul process serveur possède le fichier.

Les effets provider ne passent pas par une outbox SQL. Ils partent d'une `TxQueue` mémoire après
commit, comme t3code. Au boot la queue est vide : la reprise Session est une passe de projection
([persistance des threads](https://github.com/Hezaerd/noyau/issues/60)), pas le rejeu d'une file
durable. Les callbacks provider (permission, user-input) ne survivent pas au crash.

Sauvegarde : copie unique `db` + WAL + shm avant une update ; snapshot à chaud par `VACUUM INTO`,
jamais un `cp` live.
