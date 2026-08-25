# Session projetée t3code et adaptateur Cursor

> **Statut : supersédé par [ADR-0018](0018-runtime-cursor-porte-par-la-session.md).** Remplace
> [ADR-0007](0007-hermes-local-ou-tailscale.md) et le modèle
> `Execution` / `Attempt` / `AgentRun` de [l'ADR-0008](0008-separer-ticket-et-execution.md).
> Repli : [Replier les décisions v0.1 sur le modèle t3code](https://github.com/Hezaerd/noyau/issues/71).

Cette ADR est conservée comme historique de la première forme de la Session projetée. Sa règle
« nouveau subprocess à chaque reprise » n'est plus normative ; le cycle de vie accepté est celui
de l'ADR-0018.

Un Thread porte un titre obligatoire, un Provider immuable et un `runtimeMode` t3code. La Session
est une projection `0..1` du runtime (`status`, `lastError`, `activeTurnId`, `runtimeMode`,
`resumeCursor`). Les Turns sont append-only ; `latestTurn.state` vaut
`running | interrupted | completed | error`. Settlement = la Session quitte `running`. Plus de
cycle `requested → lost | failed`.

`resumeCursor` est `{ schemaVersion: 1, sessionId }`. Reprise = nouveau Turn, nouveau subprocess,
`session/load` avec le `WorkspaceRoot` courant. Échec de load → `session/new` en place. Aucun
prompt n'est rejoué. Au boot, une Session encore `starting` / `running` devient `error` +
`lastError` sans I/O Cursor.

Le contrat vivant est un adaptateur Cursor, pas une marque de protocole ni un port multi-harnais.
Détection : `PATH` hydraté depuis le login shell + handshake ACP. Appartenance d'un
`cursor-agent` = handle capturé au spawn,
lié au `Scope` du serveur. Pas de sweep d'orphelins. Claude, Codex, usage promis et worktrees
sont hors v0.1.
