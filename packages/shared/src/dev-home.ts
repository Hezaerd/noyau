/**
 * A `.git` file points at the real git directory. A linked worktree's lives at
 * `<common>/.git/worktrees/<name>`; a submodule's at `<common>/.git/modules/<name>`.
 * Both are files, so the pointer — not the file-vs-directory distinction alone —
 * is what identifies a worktree.
 *
 * The common dir is not necessarily named `.git`: a worktree of a bare repo
 * points at `.git/worktrees/<name>`, and `$GIT_COMMON_DIR` can be anything. So
 * match on the `worktrees/<name>` tail, which git always uses.
 */
export const pointsAtLinkedWorktree = (
  gitFileContents: string,
  normalize: (path: string) => string,
): boolean => {
  const gitdir = gitFileContents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith("gitdir:"))
    ?.slice("gitdir:".length)
    .trim()
  if (gitdir === undefined || gitdir.length === 0) {
    return false
  }

  const segments = normalize(gitdir.replaceAll("\\", "/"))
    .split(/[/\\]/)
    .filter((segment) => segment.length > 0)
  return segments.length >= 3 && segments.at(-2) === "worktrees"
}

export const worktreeNoyauHome = (worktreePath: string, join: (...segments: string[]) => string) =>
  join(worktreePath, ".noyau")

/**
 * `--home-dir` > worktree `.noyau` > ambient `NOYAU_HOME`.
 * A worktree default must outrank an ambient home so a second checkout cannot
 * open the developer's live database.
 */
export const resolveDevHome = (
  explicitHome: string | undefined,
  worktreeHome: string | undefined,
  ambientHome: string | undefined,
): string | undefined => {
  const trimmedExplicit = explicitHome?.trim()
  if (trimmedExplicit !== undefined && trimmedExplicit.length > 0) {
    return trimmedExplicit
  }
  if (worktreeHome !== undefined && worktreeHome.length > 0) {
    return worktreeHome
  }
  const trimmedAmbient = ambientHome?.trim()
  if (trimmedAmbient !== undefined && trimmedAmbient.length > 0) {
    return trimmedAmbient
  }
  return undefined
}
