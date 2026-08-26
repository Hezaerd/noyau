# Claude Code via Agent SDK

> **Statut : accepté.** Étend [ADR-0018](0018-runtime-cursor-porte-par-la-session.md) : le runtime
> Session reste unique par Thread ; Claude est un troisième provider réel, pas un fil de fer
> JSON-RPC.

Noyau pilote Claude Code par `@anthropic-ai/claude-agent-sdk` dans l’adaptateur Server, comme
t3code. Il n’existe pas de package `@noyau/claude` : le SDK *est* le transport. L’adaptateur
parle `ProviderPort` et réutilise `{ schemaVersion: 1, sessionId }` — `sessionId` est l’UUID de
session SDK, repris par `query({ resume })` après restart, crash, stop ou reaper, sans rejeu de
prompt.

Le literal durable est `claude`. Une seule instance, config Claude par défaut (`~/.claude`).
Pas de multi-compte, pas de `CLAUDE_CONFIG_DIR` exposé, pas de mode ACP Claude.

## Conséquences

- `Environment` porte `claude` au même titre que `cursor` et `codex`.
- `composeProviderPorts` route `startTurn` sur le provider du Thread ; interrupt / stop / reaper
  restent fan-out.
- TextGeneration (titre, branche, draft git) reste Cursor : ce n’est pas le `session/prompt` du
  Thread.

## Options écartées

- **Package fil de fer `@noyau/claude`** : il n’y a pas de spec JSON-RPC publique à piner, contrairement
  à ACP et `codex app-server`.
- **ACP Claude** : le SDK est l’API officielle (sessions persistées, `canUseTool`, resume, settings
  `claude_code`). ACP lisserait le transport et perdrait cette surface.
- **Élargir `resumeCursor`** : `resumeSessionAt` / `turnCount` restent volatils dans l’adaptateur ;
  le SDK reprend avec le seul `sessionId`.
