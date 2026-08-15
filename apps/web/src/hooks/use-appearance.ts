import { useSyncExternalStore } from "react"

import {
  getAppearancePreference,
  setAppearancePreference,
  subscribeAppearance,
} from "@/lib/appearance"

export const useAppearance = () => {
  const preference = useSyncExternalStore(
    subscribeAppearance,
    getAppearancePreference,
    getAppearancePreference,
  )

  return {
    preference,
    setPreference: setAppearancePreference,
  } as const
}
