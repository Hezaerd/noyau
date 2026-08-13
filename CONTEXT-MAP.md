# Carte des contextes

Contextes du monorepo Noyau et leurs relations. Un contexte = un `CONTEXT.md` local.

## Contextes

| Contexte | Chemin               | Rôle                                                                |
| -------- | -------------------- | ------------------------------------------------------------------- |
| Protocol | `packages/protocol/` | Contrat : schémas des IDs, entités, commandes et événements.        |
| Domain   | `packages/domain/`   | Décision : deciders et projectors purs sur le journal d'événements. |
| Database | `packages/database/` | Durabilité : event log, receipts, outbox, projections PostgreSQL.   |
| Server   | `apps/server/`       | Frontière RPC : commandes, snapshots et flux d'événements.          |
| Web      | `apps/web/`          | UI React (TanStack Router, Vite) pour collaboration et supervision. |

## Relations

```text
apps/web ──(futur: Effect RPC sur WebSocket)──> apps/server
                                                     │
                                                     ├──> packages/database
                                                     ├──> packages/domain
                                                     `──> packages/protocol

packages/database ──dépend de──> packages/domain ──dépend de──> packages/protocol
```

- `protocol` ne dépend de rien (hors `effect`).
- `domain` dépend de `protocol` uniquement. Jamais l'inverse.
- `database` dépend de `domain` et `protocol` ; le driver SQL concret (pg, pglite) est fourni
  par l'app ou le test, jamais par le package.
- `server` enrichit et exécute les commandes, lit les projections et diffuse les événements ;
  le driver PostgreSQL concret et l'identité de développement restent à cette frontière.
- Les apps consomment `protocol` pour les types de frontière ; seul `server` consomme
  `domain` et `database` (les reactors vivent dans le même processus, ADR-0004).

## Langage

Le glossaire de référence est dans `AGENTS.md`. Les termes spécifiques à un contexte vivent dans
son `CONTEXT.md`.
