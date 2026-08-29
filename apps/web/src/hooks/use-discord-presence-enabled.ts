import { useAppAtomValue } from "@/hooks/use-app-atom"
import { discordPresenceEnabledAtom } from "@/state/preferences"

export const useDiscordPresenceEnabled = (): boolean => useAppAtomValue(discordPresenceEnabledAtom)
