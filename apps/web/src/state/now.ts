import { Atom } from "effect/unstable/reactivity"

import { appAtomRegistry } from "@/state/atom-registry"

export const minuteFloorMs = (nowMs: number): number => Math.floor(nowMs / 60_000) * 60_000

export const nowMinuteAtom = Atom.make(minuteFloorMs(Date.now())).pipe(
  Atom.keepAlive,
  Atom.withLabel("chrome:now-minute"),
)

let clockStarted = false

export const initializeNowMinuteClock = (): void => {
  if (clockStarted) {
    return
  }
  clockStarted = true
  const tick = (): void => {
    appAtomRegistry.set(nowMinuteAtom, minuteFloorMs(Date.now()))
  }
  const delay = 60_000 - (Date.now() % 60_000) + 50
  window.setTimeout(() => {
    tick()
    window.setInterval(tick, 60_000)
  }, delay)
}
