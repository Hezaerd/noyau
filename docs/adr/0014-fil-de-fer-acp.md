# Fil de fer ACP, pas un port multi-harnais

> **Statut : accepté.** Précise le contrat ACP de [ADR-0013](0013-session-projetee-et-cursor.md),
> dont le cycle de vie runtime est remplacé par [ADR-0018](0018-runtime-cursor-porte-par-la-session.md).

Le contrat vivant Noyau reste l'adaptateur Cursor et `ProviderPort`. `@noyau/acp` n'est que le
fil de fer : schémas codegen depuis la spec officielle pinée, JSON-RPC stdio, `AcpClient`.
Claude, Codex et un harnais générique restent hors v0.1. Les extensions Cursor
(`cursor/ask_question`) restent dans `apps/server`.
