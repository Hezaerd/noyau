# Canal HITL unique : questionnaire Thread

> **Statut : accepté.** Complète [ADR-0014](0014-fil-de-fer-acp.md) et
> [ADR-0015](0015-tableau-accessible-aux-agents-par-mcp.md).

Les agents (Cursor, et plus tard Codex / Claude Code) doivent pouvoir poser des questions
structurées à l'humain pendant un Turn, avec la même UX Noyau quel que soit le harnais.

## Décision

Le canal unique est la primitive durable `transcript.user-input` (title, questions, answers) +
la commande `user-input.respond`.

- **API agent portable** : l'outil MCP `noyau_ask_question` (capacité `thread:ask`).
- **Entrée Cursor native** : l'extension ACP `cursor/ask_question` mappe vers le même registry /
  la même projection ; ce n'est pas une UX parallèle.
- **Runtime** : `TurnUserInputRegistry` lie l'émission transcript du Turn actif et les Deferred
  résolus par `ProviderPort.respondUserInput`.
- **UI** : questionnaire inline sticky, toutes les questions visibles, Other toujours disponible ;
  les answers restent sur l'item resolved pour relecture.

## Options écartées

- MCP `elicitation/create` : demande au host agent, pas à l'UI Noyau.
- UX distincte par provider : divergences Cursor vs Codex vs Claude.
- Timeout court sur le Deferred MCP : une round grilling peut prendre du temps ; l'interrupt Turn
  annule avec `answers: {}`.

## Conséquences

Les skills (grilling) préfèrent `noyau_ask_question` quand le toolkit Noyau est injecté.
Les adapters Codex / Claude réutilisent le même registry dès qu'ils injectent le MCP Noyau.
Les Deferred restent en mémoire (ADR-0012) : pas de reprise HITL après crash.
