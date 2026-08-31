import type { ReleaseChannel } from "./release-brand.ts"

export const SETTINGS_FILE_NAME = "settings.json"
export const KEYBINDINGS_FILE_NAME = "keybindings.json"
export const CONFIG_FILE_NAMES = [SETTINGS_FILE_NAME, KEYBINDINGS_FILE_NAME] as const

export type NoyauHomeChannel = "dev" | "latest" | "nightly"

export const noyauHomeChannel = (channel: ReleaseChannel): NoyauHomeChannel =>
  channel === "development" ? "dev" : channel

export const channelHomeRelativeSegments = (
  channel: ReleaseChannel,
): readonly [".noyau", NoyauHomeChannel] => [".noyau", noyauHomeChannel(channel)]

export const resolveChannelHome = (
  join: (...segments: ReadonlyArray<string>) => string,
  homeDirectory: string,
  channel: ReleaseChannel,
): string => join(homeDirectory, ...channelHomeRelativeSegments(channel))

export const resolveConfigDirectory = (input: {
  readonly join: (...segments: ReadonlyArray<string>) => string
  readonly dataDirectory: string
  readonly homeDirectory: string
  readonly releaseChannel: ReleaseChannel
  readonly explicitHome: boolean
}): string =>
  input.explicitHome
    ? input.dataDirectory
    : resolveChannelHome(input.join, input.homeDirectory, input.releaseChannel)

export const liveConfigSeedDirectories = (input: {
  readonly join: (...segments: ReadonlyArray<string>) => string
  readonly homeDirectory: string
  readonly releaseChannel: ReleaseChannel
}): ReadonlyArray<string> => {
  const channelHome = resolveChannelHome(input.join, input.homeDirectory, input.releaseChannel)
  const userdata = input.join(input.homeDirectory, ".noyau", "userdata")
  const nightly = resolveChannelHome(input.join, input.homeDirectory, "nightly")
  const latest = resolveChannelHome(input.join, input.homeDirectory, "latest")
  return [...new Set([channelHome, userdata, nightly, latest])]
}

export const shouldSeedWorktreeConfig = (input: {
  readonly explicitHomeDir: boolean
  readonly worktreeHome: string | undefined
}): boolean => input.worktreeHome !== undefined && !input.explicitHomeDir

export const planWorktreeConfigSeed = (input: {
  readonly destDirectory: string
  readonly sourceDirectories: ReadonlyArray<string>
  readonly destExists: (fileName: string) => boolean
  readonly sourceExists: (directory: string, fileName: string) => boolean
  readonly join: (...segments: ReadonlyArray<string>) => string
}): ReadonlyArray<{ readonly from: string; readonly to: string }> => {
  const copies: Array<{ readonly from: string; readonly to: string }> = []
  for (const fileName of CONFIG_FILE_NAMES) {
    if (input.destExists(fileName)) {
      continue
    }
    for (const sourceDirectory of input.sourceDirectories) {
      if (!input.sourceExists(sourceDirectory, fileName)) {
        continue
      }
      copies.push({
        from: input.join(sourceDirectory, fileName),
        to: input.join(input.destDirectory, fileName),
      })
      break
    }
  }
  return copies
}

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
