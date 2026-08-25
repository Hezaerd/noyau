import { useAtomValue } from "@effect/atom-react"

import { nowMinuteAtom } from "@/state/now"

/** Horloge minute-quantized, comme t3code : l'auto-settle d'inactivité ne tick pas à la seconde. */
export const useNowMinuteMs = (): number => useAtomValue(nowMinuteAtom)
