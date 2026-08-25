import { useAtomValue } from "@effect/atom-react"

import { discordPresenceEnabledAtom } from "@/state/preferences"

export const useDiscordPresenceEnabled = (): boolean => useAtomValue(discordPresenceEnabledAtom)
