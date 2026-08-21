import { useEffect, type RefObject } from "react"

import {
  applyGazeToEyes,
  GAZE_LERP,
  gazeAxes,
  gazeTransform,
  lerpGaze,
  REST_GAZE,
} from "@/lib/brand-gaze"

import { useMediaQuery } from "./use-media-query"

export function useBrandGaze(hostRef: RefObject<HTMLElement | null>): void {
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)")
  const canTrackPointer = useMediaQuery("(hover: hover) and (pointer: fine)")

  useEffect(() => {
    if (reduceMotion || !canTrackPointer) {
      return undefined
    }
    const host = hostRef.current
    if (host === null) {
      return undefined
    }

    const desktop = window.noyauDesktop
    const pollDesktop = desktop !== undefined
    let current = REST_GAZE
    let target = REST_GAZE
    let raf = 0
    let inFlight = false
    let cancelled = false

    const eyes = () => host.querySelectorAll<SVGGElement>(".mo-eye")

    const tick = () => {
      if (cancelled) {
        return
      }
      if (pollDesktop && !inFlight) {
        inFlight = true
        void desktop
          .getCursorPoint()
          .then((point) => {
            if (cancelled || point === undefined) {
              return undefined
            }
            const axes = gazeAxes(point.x, point.y, point.width, point.height)
            target = gazeTransform(axes.nx, axes.ny)
            return undefined
          })
          .finally(() => {
            inFlight = false
          })
      }
      current = lerpGaze(current, target, GAZE_LERP)
      applyGazeToEyes(eyes(), current)
      raf = requestAnimationFrame(tick)
    }

    const onMove = (event: PointerEvent) => {
      const axes = gazeAxes(event.clientX, event.clientY, window.innerWidth, window.innerHeight)
      target = gazeTransform(axes.nx, axes.ny)
    }

    if (!pollDesktop) {
      document.addEventListener("pointermove", onMove, { capture: true, passive: true })
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      if (!pollDesktop) {
        document.removeEventListener("pointermove", onMove, { capture: true })
      }
      for (const eye of eyes()) {
        eye.style.transform = ""
      }
    }
  }, [canTrackPointer, hostRef, reduceMotion])
}
