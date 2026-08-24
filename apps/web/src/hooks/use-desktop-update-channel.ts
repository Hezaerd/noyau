import { useSyncExternalStore } from "react"

import type { DesktopUpdatePackagedChannel } from "@/lib/desktop-bridge"
import {
  getDesktopUpdateChannel,
  subscribeDesktopUpdateChannel,
} from "@/lib/desktop-update-channel-preference"

export const useDesktopUpdateChannel = (): DesktopUpdatePackagedChannel =>
  useSyncExternalStore(
    subscribeDesktopUpdateChannel,
    getDesktopUpdateChannel,
    getDesktopUpdateChannel,
  )
