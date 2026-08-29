import { useAppAtomValue } from "@/hooks/use-app-atom"
import { turnNotificationEnabledAtom } from "@/state/preferences"

export const useTurnNotificationEnabled = (): boolean =>
  useAppAtomValue(turnNotificationEnabledAtom)
