# Carte des contextes

Contextes du monorepo Noyau et leurs relations. Un contexte = un `CONTEXT.md` local.

La spec v0.1 est [ADR-0011](docs/adr/0011-noyau-local-first-v0.1.md). L'arbre peut encore contenir
les formes précédentes : ne pas les étendre.

## Contextes

| Contexte | Chemin               | Rôle                                                                   |
| -------- | -------------------- | ---------------------------------------------------------------------- |
| Protocol | `packages/protocol/` | Contrat : schémas des IDs, commandes, événements et RPC.               |
| Domain   | `packages/domain/`   | Décision : deciders et projectors purs sur le journal.                 |
| ACP      | `packages/acp/`      | Fil de fer ACP : codegen spec, JSON-RPC stdio, `AcpClient`.            |
| Codex    | `packages/codex/`    | Fil de fer `codex app-server` : codegen spec, JSON-RPC stdio.          |
| Shared   | `packages/shared/`   | Helpers purs : marque de release, ComposerTrigger et Mention.          |
| Server   | `apps/server/`       | Frontières RPC/MCP, SQLite, adaptateurs Cursor/Claude/Codex, reactors. |
| Web      | `apps/web/`          | UI React (TanStack Router, Vite) : Tableau, Threads, Dialog Ticket.    |
| Desktop  | `apps/desktop/`      | Electron : superviseur du serveur enfant et chrome hôte.               |

## Relations

```text
apps/desktop ──supervise──> apps/server
apps/web     ──(Effect RPC WS loopback)──> apps/server
                                              │
                                              ├──> packages/domain
                                              ├──> packages/protocol
                                              ├──> packages/acp
                                              ├──> packages/codex
                                              `──> packages/shared

apps/desktop ──enveloppe──> apps/web
apps/web     ──consomme──> packages/shared
apps/web     ──consomme──> packages/protocol

packages/domain ──dépend de──> packages/protocol
packages/shared ──ne dépend de rien──
```

- `protocol` ne dépend de rien (hors `effect`).
- `domain` dépend de `protocol` uniquement. Jamais l'inverse.
- `acp` ne dépend de rien (hors `effect`). Fil de fer spec, pas un port multi-provider.
- `codex` ne dépend de rien (hors `effect`). Fil de fer `app-server`, pas un port multi-provider.
- `shared` ne dépend de rien. Helpers purs consommés par `web` et `server`.
- `server` enrichit les commandes, possède SQLite (`src/persistence/`, `node:sqlite`), spawn Cursor,
  Claude et Codex, pousse les streams RPC et expose le Tableau aux agents par MCP HTTP.
- `desktop` supervise le process serveur (fd3, token de lancement, PID). Aucun état métier.
- Les apps consomment `protocol` pour les types de frontière. Seul `server` consomme `domain`,
  `acp` et `codex`. Les reactors vivent dans le même processus.

## Langage

Le glossaire système est dans `AGENTS.md`. Les termes spécifiques à un contexte vivent dans son
`CONTEXT.md`.
