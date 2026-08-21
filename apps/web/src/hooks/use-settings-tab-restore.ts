import { DEFAULT_APPEARANCE_PREFERENCE } from "@/components/settings/AppearanceSettingsPanel"
import { useAppearance } from "@/hooks/use-appearance"
import { useKeybindings } from "@/hooks/use-keybindings"
import { useProjectFolderStartDirectory } from "@/hooks/use-project-folder-start-directory"
import { setAppearancePreference } from "@/lib/appearance"
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

  switch (tabId) {
    case "general":
      return {
        canRestore: projectFolderStartDirectory !== "",
        restore: () => setProjectFolderStartDirectory(""),
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
