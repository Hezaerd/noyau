import { useAtomValue } from "@effect/atom-react"

import type { DesktopUpdatePackagedChannel } from "@/lib/desktop-bridge"
import { desktopUpdateChannelAtom } from "@/state/preferences"

export const useDesktopUpdateChannel = (): DesktopUpdatePackagedChannel =>
  useAtomValue(desktopUpdateChannelAtom)
