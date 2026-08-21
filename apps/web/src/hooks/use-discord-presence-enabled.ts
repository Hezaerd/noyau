import { useSyncExternalStore } from "react"

import {
  getDiscordPresenceEnabled,
  subscribeDiscordPresenceEnabled,
} from "@/lib/discord-presence-preference"

export const useDiscordPresenceEnabled = (): boolean =>
  useSyncExternalStore(
    subscribeDiscordPresenceEnabled,
    getDiscordPresenceEnabled,
    getDiscordPresenceEnabled,
  )
