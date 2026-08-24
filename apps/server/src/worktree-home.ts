import type { ReleaseChannel } from "@noyau/shared/release-brand"

export type WorktreeHomeChannel = "dev" | "latest" | "nightly"

/** Segment dossier du canal : `development` → `dev`. */
export const worktreeHomeChannel = (channel: ReleaseChannel): WorktreeHomeChannel =>
  channel === "development" ? "dev" : channel

/** `~/.noyau/<canal>/worktree` — hors `dataDirectory`. */
export const worktreeHomeRelativeSegments = (
  channel: ReleaseChannel,
): readonly [".noyau", WorktreeHomeChannel, "worktree"] => [
  ".noyau",
  worktreeHomeChannel(channel),
  "worktree",
]

export const resolveWorktreesDir = (
  join: (...segments: ReadonlyArray<string>) => string,
  homeDirectory: string,
  channel: ReleaseChannel,
): string => join(homeDirectory, ...worktreeHomeRelativeSegments(channel))
