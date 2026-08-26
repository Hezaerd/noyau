import { useAtomValue } from "@effect/atom-react"

import { turnNotificationEnabledAtom } from "@/state/preferences"

export const useTurnNotificationEnabled = (): boolean => useAtomValue(turnNotificationEnabledAtom)
