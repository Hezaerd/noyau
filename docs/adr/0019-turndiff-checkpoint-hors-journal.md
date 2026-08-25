# TurnDiff durable, Checkpoint git hors journal

> **Statut : accepté.** Complète [ADR-0015](0015-checkout-thread-et-git-live.md). Post-v0.1.

Le résumé des fichiers touchés par un Turn est un fait de Turn (`TurnDiff`), pas un état Git.
Les snapshots workspace sont des refs cachées `refs/noyau/checkpoint/<threadId>/<ordinal>`,
capturées par `GitRuntime` (index temporaire, `write-tree` / `commit-tree` / `update-ref`).
Le cwd reste `thread.worktreePath ?? WorkspaceRoot`.

Un `git diff` vs HEAD à la fin du Turn est trop faible : le working tree peut déjà être dirty, et
Cursor peut committer pendant le Turn. Les diffs ACP `file_change` ratent les edits shell.

Le patch unifié n’entre pas dans SQLite : `thread.getTurnDiff` le recalcule à la demande.
Le panneau Pierre rend ce patch. Un revert de Checkpoint reste un effort suivant.
Hors git : pas de capture, pas de carte.
