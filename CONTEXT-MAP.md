# Carte des contextes

Contextes du monorepo Noyau et leurs relations. Un contexte = un `CONTEXT.md` local.

## Contextes

| Contexte | Chemin               | Rôle                                                                |
| -------- | -------------------- | ------------------------------------------------------------------- |
| Protocol | `packages/protocol/` | Contrat : schémas des IDs, entités, commandes et événements.        |
| Domain   | `packages/domain/`   | Décision : deciders et projectors purs sur le journal d'événements. |
| Web      | `apps/web/`          | UI React (TanStack Router, Vite) — pas encore de `CONTEXT.md`.      |

## Relations

```text
apps/web ──(futur: RPC/SSE typé)──> control-plane (à créer)
                                        │ decide/evolve
packages/domain ──dépend de──> packages/protocol
```

- `protocol` ne dépend de rien (hors `effect`).
- `domain` dépend de `protocol` uniquement. Jamais l'inverse.
- Les apps consommeront `protocol` pour les types de frontière ; seules `control-plane` et
  `worker` (à créer) consommeront `domain`.

## Langage

Le glossaire de référence est dans `AGENTS.md`. Les termes spécifiques à un contexte vivent dans
son `CONTEXT.md`.
