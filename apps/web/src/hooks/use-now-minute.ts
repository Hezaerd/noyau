import { useEffect, useState } from "react"

const minuteFloorMs = (nowMs: number): number => Math.floor(nowMs / 60_000) * 60_000

/** Horloge minute-quantized, comme t3code : l'auto-settle d'inactivité ne tick pas à la seconde. */
export const useNowMinuteMs = (): number => {
  const [nowMs, setNowMs] = useState(() => minuteFloorMs(Date.now()))

  useEffect(() => {
    const tick = () => setNowMs(minuteFloorMs(Date.now()))
    const delay = 60_000 - (Date.now() % 60_000) + 50
    let intervalId = 0
    const timeoutId = window.setTimeout(() => {
      tick()
      intervalId = window.setInterval(tick, 60_000)
    }, delay)
    return () => {
      window.clearTimeout(timeoutId)
      window.clearInterval(intervalId)
    }
  }, [])

  return nowMs
}
