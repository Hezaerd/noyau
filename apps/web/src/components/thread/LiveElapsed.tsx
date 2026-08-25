import { useEffect, useRef } from "react"

import { subscribeNowMs } from "@/lib/now-ms"
import { formatElapsedLabel } from "@/lib/thread-activity"

export function LiveElapsed({
  startedAtMs,
  format = formatElapsedLabel,
  prefix,
  className,
  hidden = false,
}: {
  readonly startedAtMs: number
  readonly format?: (elapsedMs: number) => string
  readonly prefix?: string
  readonly className?: string
  readonly hidden?: boolean
}) {
  const textRef = useRef<HTMLSpanElement>(null)
  const initial = (() => {
    const body = format(Date.now() - startedAtMs)
    return prefix === undefined ? body : `${prefix}${body}`
  })()

  useEffect(() => {
    const updateText = (nowMs: number) => {
      if (textRef.current === null) {
        return
      }
      const body = format(nowMs - startedAtMs)
      textRef.current.textContent = prefix === undefined ? body : `${prefix}${body}`
    }
    updateText(Date.now())
    return subscribeNowMs(updateText)
  }, [format, prefix, startedAtMs])

  return (
    <span ref={textRef} aria-hidden={hidden ? true : undefined} className={className}>
      {initial}
    </span>
  )
}
