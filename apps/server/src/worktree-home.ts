import { channelHomeRelativeSegments, noyauHomeChannel } from "@noyau/shared/dev-home"
import type { ReleaseChannel } from "@noyau/shared/release-brand"

export type WorktreeHomeChannel = ReturnType<typeof noyauHomeChannel>

/** Segment dossier du canal : `development` → `dev`. */
export const worktreeHomeChannel = noyauHomeChannel

/** `~/.noyau/<canal>/worktree` — hors `dataDirectory`. */
export const worktreeHomeRelativeSegments = (
  channel: ReleaseChannel,
): readonly [".noyau", WorktreeHomeChannel, "worktree"] => [
  ...channelHomeRelativeSegments(channel),
  "worktree",
]

export const resolveWorktreesDir = (
  join: (...segments: ReadonlyArray<string>) => string,
  homeDirectory: string,
  channel: ReleaseChannel,
): string => join(homeDirectory, ...worktreeHomeRelativeSegments(channel))
