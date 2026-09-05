import { DEFAULT_SETTINGS_TAB } from "@/lib/settings-catalog"

export const DEFAULT_SETTINGS_PATH = `/settings/${DEFAULT_SETTINGS_TAB}` as const

export const navigateToSettings = async (
  navigate: () => Promise<void>,
  hardNavigate: (path: string) => void = (path) => window.location.assign(path),
): Promise<void> => {
  try {
    await navigate()
  } catch {
    hardNavigate(DEFAULT_SETTINGS_PATH)
  }
}
