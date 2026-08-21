import { DEFAULT_APPEARANCE_PREFERENCE } from "@/components/settings/AppearanceSettingsPanel"
import { useAppearance } from "@/hooks/use-appearance"
import { useDiscordPresenceEnabled } from "@/hooks/use-discord-presence-enabled"
import { useKeybindings } from "@/hooks/use-keybindings"
import { useProjectFolderStartDirectory } from "@/hooks/use-project-folder-start-directory"
import { setAppearancePreference } from "@/lib/appearance"
import {
  DEFAULT_DISCORD_PRESENCE_ENABLED,
  setDiscordPresenceEnabled,
} from "@/lib/discord-presence-preference"
import { hasCustomKeybindings } from "@/lib/keybindings"
import { setProjectFolderStartDirectory } from "@/lib/project-folder-preference"
import type { SettingsTabId } from "@/lib/settings-catalog"

export interface SettingsTabRestore {
  readonly canRestore: boolean
  readonly restore: () => void
}

export const useSettingsTabRestore = (tabId: SettingsTabId): SettingsTabRestore => {
  const { preference } = useAppearance()
  const { resetAll } = useKeybindings()
  const projectFolderStartDirectory = useProjectFolderStartDirectory()
  const discordPresenceEnabled = useDiscordPresenceEnabled()

  switch (tabId) {
    case "general":
      return {
        canRestore:
          projectFolderStartDirectory !== "" ||
          discordPresenceEnabled !== DEFAULT_DISCORD_PRESENCE_ENABLED,
        restore: () => {
          setProjectFolderStartDirectory("")
          setDiscordPresenceEnabled(DEFAULT_DISCORD_PRESENCE_ENABLED)
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
