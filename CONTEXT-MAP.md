# Carte des contextes

Contextes du monorepo Noyau et leurs relations. Un contexte = un `CONTEXT.md` local.

La spec v0.1 est [ADR-0011](docs/adr/0011-noyau-local-first-v0.1.md). L'arbre peut encore contenir
les formes précédentes : ne pas les étendre.

## Contextes

| Contexte | Chemin               | Rôle                                                                    |
| -------- | -------------------- | ----------------------------------------------------------------------- |
| Protocol | `packages/protocol/` | Contrat : schémas des IDs, commandes, événements et RPC.                |
| Domain   | `packages/domain/`   | Décision : deciders et projectors purs sur le journal.                  |
| Database | `packages/database/` | Durabilité : journal SQLite, receipts, projections.                     |
| ACP      | `packages/acp/`      | Fil de fer ACP : codegen spec, JSON-RPC stdio, `AcpClient`.             |
| Server   | `apps/server/`       | Frontières RPC/MCP, composition, adaptateur Cursor, reactors `TxQueue`. |
| Web      | `apps/web/`          | UI React (TanStack Router, Vite) : Tableau, Threads, Dialog Ticket.     |
| Desktop  | `apps/desktop/`      | Electron : superviseur du serveur enfant et chrome hôte.                |

## Relations

```text
apps/desktop ──supervise──> apps/server
apps/web     ──(Effect RPC WS loopback)──> apps/server
                                              │
                                              ├──> packages/database
                                              ├──> packages/domain
                                              ├──> packages/protocol
                                              `──> packages/acp

apps/desktop ──enveloppe──> apps/web

packages/database ──dépend de──> packages/domain ──dépend de──> packages/protocol
```

- `protocol` ne dépend de rien (hors `effect`).
- `domain` dépend de `protocol` uniquement. Jamais l'inverse.
- `database` dépend de `domain` et `protocol`. Le driver concret est `node:sqlite`, fourni par
  l'app ou le test, jamais choisi par le package comme « PG ou PGlite ».
- `acp` ne dépend de rien (hors `effect`). Fil de fer spec, pas un port multi-provider.
- `server` enrichit les commandes, possède SQLite, spawn Cursor, pousse les streams RPC et expose
  le Tableau aux agents par MCP HTTP.
- `desktop` supervise le process serveur (fd3, token de lancement, PID). Aucun état métier.
- Les apps consomment `protocol` pour les types de frontière. Seul `server` consomme `domain`,
  `database` et `acp`. Les reactors vivent dans le même processus.

## Langage

Le glossaire système est dans `AGENTS.md`. Les termes spécifiques à un contexte vivent dans son
`CONTEXT.md`.
