import { useAtomValue } from "@effect/atom-react"

import { appearancePreferenceAtom, setAppearancePreference } from "@/state/preferences"

export const useAppearance = () => {
  const preference = useAtomValue(appearancePreferenceAtom)
  return {
    preference,
    setPreference: setAppearancePreference,
  } as const
}
