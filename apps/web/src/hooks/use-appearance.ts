import { useAppAtomValue } from "@/hooks/use-app-atom"
import { appearancePreferenceAtom, setAppearancePreference } from "@/state/preferences"

export const useAppearance = () => {
  const preference = useAppAtomValue(appearancePreferenceAtom)
  return {
    preference,
    setPreference: setAppearancePreference,
  } as const
}
