# Checkout sur le Thread, Git live hors journal

> **Statut : accepté.** Complète [ADR-0006](0006-github-seulement.md) et le cwd de
> [ADR-0013](0013-session-projetee-et-cursor.md). Hors du périmètre v0.1 d'origine
> (worktrees / PR) : tranche post-v0.1 calquée sur t3code.

Le Git n'est pas un agrégat du journal. `vcs.*` et `git.*` sont des RPC live du Server
(`GitRuntime` / `GitPlane`). Le seul fait durable est le **Checkout** du Thread :
`worktreePath` (cwd, `null` = `WorkspaceRoot`) et `branch` (dernière ref liée par Noyau, pas le
HEAD live). `threadEnvMode` (`local | worktree`) reste une intention de draft, matérialisée au
premier `thread.turn.start`.

`local` peut `git checkout` dans le `WorkspaceRoot` — l'isolation est opt-in via `worktree`. Si
la branche est déjà extraite ailleurs, on réutilise ce worktree. Un mismatch
`thread.branch !== HEAD` en local n'auto-checkout pas à l'envoi : bannière, l'envoi continue sur
HEAD. Cursor spawn avec `thread.worktreePath ?? project.workspaceRoot`. GitHub seulement
(`git` + `gh` sur `PATH`).
