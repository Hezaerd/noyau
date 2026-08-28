import { DEFAULT_APPEARANCE_PREFERENCE } from "@/components/settings/AppearanceSettingsPanel"
import { useAppearance } from "@/hooks/use-appearance"
import { useDiscordPresenceEnabled } from "@/hooks/use-discord-presence-enabled"
import { useKeybindings } from "@/hooks/use-keybindings"
import { useProjectFolderStartDirectory } from "@/hooks/use-project-folder-start-directory"
import {
  useAutoSettleAfterDays,
  useAutoSettleOnMergeEnabled,
} from "@/hooks/use-thread-settle-preference"
import { useTranscriptPaintMode } from "@/hooks/use-transcript-paint-preference"
import { useTurnCuePreference } from "@/hooks/use-turn-cue"
import { useTurnNotificationEnabled } from "@/hooks/use-turn-notification"
import { DEFAULT_DISCORD_PRESENCE_ENABLED } from "@/lib/discord-presence-preference"
import type { SettingsTabId } from "@/lib/settings-catalog"
import {
  DEFAULT_AUTO_SETTLE_AFTER_DAYS,
  DEFAULT_AUTO_SETTLE_ON_MERGE,
} from "@/lib/thread-settle-preference"
import { isTranscriptPaintPreferenceDefault } from "@/lib/transcript-paint-preference"
import { isTurnCuePreferenceDefault } from "@/lib/turn-cue-preference"
import { DEFAULT_TURN_NOTIFICATION_ENABLED } from "@/lib/turn-notification-preference"
import { hasCustomKeybindings } from "@/state/keybindings"
import {
  resetTranscriptPaintPreference,
  resetTurnCuePreference,
  resetTurnNotificationPreference,
  setAppearancePreference,
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
  const transcriptPaint = useTranscriptPaintMode()
  const { resetAll } = useKeybindings()
  const projectFolderStartDirectory = useProjectFolderStartDirectory()
  const autoSettleOnMerge = useAutoSettleOnMergeEnabled()
  const autoSettleAfterDays = useAutoSettleAfterDays()
  const discordPresenceEnabled = useDiscordPresenceEnabled()
  const turnCue = useTurnCuePreference()
  const turnNotificationEnabled = useTurnNotificationEnabled()

  switch (tabId) {
    case "general":
      return {
        canRestore:
          projectFolderStartDirectory !== "" ||
          autoSettleOnMerge !== DEFAULT_AUTO_SETTLE_ON_MERGE ||
          autoSettleAfterDays !== DEFAULT_AUTO_SETTLE_AFTER_DAYS ||
          discordPresenceEnabled !== DEFAULT_DISCORD_PRESENCE_ENABLED ||
          !isTurnCuePreferenceDefault(turnCue) ||
          turnNotificationEnabled !== DEFAULT_TURN_NOTIFICATION_ENABLED,
        restore: () => {
          setProjectFolderStartDirectory("")
          resetThreadSettlePreference()
          setDiscordPresenceEnabled(DEFAULT_DISCORD_PRESENCE_ENABLED)
          resetTurnCuePreference()
          resetTurnNotificationPreference()
        },
      }
    case "appearance":
      return {
        canRestore:
          preference !== DEFAULT_APPEARANCE_PREFERENCE ||
          !isTranscriptPaintPreferenceDefault(transcriptPaint),
        restore: () => {
          setAppearancePreference(DEFAULT_APPEARANCE_PREFERENCE)
          resetTranscriptPaintPreference()
        },
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
