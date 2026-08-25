import { DEFAULT_APPEARANCE_PREFERENCE } from "@/components/settings/AppearanceSettingsPanel"
import { useAppearance } from "@/hooks/use-appearance"
import { useAutoRemoveMergedWorktreeEnabled } from "@/hooks/use-auto-remove-merged-worktree"
import { useDiscordPresenceEnabled } from "@/hooks/use-discord-presence-enabled"
import { useKeybindings } from "@/hooks/use-keybindings"
import { useProjectFolderStartDirectory } from "@/hooks/use-project-folder-start-directory"
import {
  useAutoSettleAfterDays,
  useAutoSettleOnMergeEnabled,
} from "@/hooks/use-thread-settle-preference"
import { useTurnCuePreference } from "@/hooks/use-turn-cue"
import { DEFAULT_AUTO_REMOVE_MERGED_WORKTREE } from "@/lib/auto-remove-merged-worktree-preference"
import { DEFAULT_DISCORD_PRESENCE_ENABLED } from "@/lib/discord-presence-preference"
import type { SettingsTabId } from "@/lib/settings-catalog"
import {
  DEFAULT_AUTO_SETTLE_AFTER_DAYS,
  DEFAULT_AUTO_SETTLE_ON_MERGE,
} from "@/lib/thread-settle-preference"
import { isTurnCuePreferenceDefault } from "@/lib/turn-cue-preference"
import { hasCustomKeybindings } from "@/state/keybindings"
import {
  resetTurnCuePreference,
  setAppearancePreference,
  setAutoRemoveMergedWorktreeEnabled,
  setDiscordPresenceEnabled,
  setProjectFolderStartDirectory,
} from "@/state/preferences"
import { resetThreadSettlePreference } from "@/state/thread-settle"

export interface SettingsTabRestore {
  readonly canRestore: boolean
  readonly restore: () => void
}

export const useSettingsTabRestore = (tabId: SettingsTabId): SettingsTabRestore => {
  const { preference } = useAppearance()
  const { resetAll } = useKeybindings()
  const projectFolderStartDirectory = useProjectFolderStartDirectory()
  const autoRemoveMergedWorktree = useAutoRemoveMergedWorktreeEnabled()
  const autoSettleOnMerge = useAutoSettleOnMergeEnabled()
  const autoSettleAfterDays = useAutoSettleAfterDays()
  const discordPresenceEnabled = useDiscordPresenceEnabled()
  const turnCue = useTurnCuePreference()

  switch (tabId) {
    case "general":
      return {
        canRestore:
          projectFolderStartDirectory !== "" ||
          autoRemoveMergedWorktree !== DEFAULT_AUTO_REMOVE_MERGED_WORKTREE ||
          autoSettleOnMerge !== DEFAULT_AUTO_SETTLE_ON_MERGE ||
          autoSettleAfterDays !== DEFAULT_AUTO_SETTLE_AFTER_DAYS ||
          discordPresenceEnabled !== DEFAULT_DISCORD_PRESENCE_ENABLED ||
          !isTurnCuePreferenceDefault(turnCue),
        restore: () => {
          setProjectFolderStartDirectory("")
          setAutoRemoveMergedWorktreeEnabled(DEFAULT_AUTO_REMOVE_MERGED_WORKTREE)
          resetThreadSettlePreference()
          setDiscordPresenceEnabled(DEFAULT_DISCORD_PRESENCE_ENABLED)
          resetTurnCuePreference()
        },
      }
    case "appearance":
      return {
        canRestore: preference !== DEFAULT_APPEARANCE_PREFERENCE,
        restore: () => setAppearancePreference(DEFAULT_APPEARANCE_PREFERENCE),
      }
    case "keybindings":
      return {
        canRestore: hasCustomKeybindings(),
        restore: resetAll,
      }
    case "providers":
      return {
        canRestore: false,
        restore: () => undefined,
      }
  }
}
