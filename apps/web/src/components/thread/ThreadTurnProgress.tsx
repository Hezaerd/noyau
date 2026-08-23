import { useEffect, useRef } from "react"

import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker"
import { Spinner } from "@/components/ui/spinner"
import { workingTranscriptLabel } from "@/lib/thread-activity"

function WorkingTimer({ startedAtMs }: { readonly startedAtMs: number }) {
  const textRef = useRef<HTMLSpanElement>(null)
  const initial = workingTranscriptLabel(startedAtMs, Date.now())

  useEffect(() => {
    const updateText = () => {
      if (textRef.current !== null) {
        textRef.current.textContent = workingTranscriptLabel(startedAtMs, Date.now())
      }
    }
    updateText()
    const id = window.setInterval(updateText, 1_000)
    return () => {
      window.clearInterval(id)
    }
  }, [startedAtMs])

  return <span ref={textRef}>{initial}</span>
}

export function ThreadWorkingMarker({ startedAtMs }: { readonly startedAtMs: number | null }) {
  return (
    <Marker role="status">
      <MarkerIcon>
        <Spinner />
      </MarkerIcon>
      <MarkerContent className="tabular-nums">
        {startedAtMs === null ? (
          workingTranscriptLabel(null, Date.now())
        ) : (
          <WorkingTimer startedAtMs={startedAtMs} />
        )}
      </MarkerContent>
    </Marker>
  )
}

export function ThreadSettledMarker({ label }: { readonly label: string }) {
  return (
    <Marker role="status" className="text-xs">
      <MarkerContent className="tabular-nums">{label}</MarkerContent>
    </Marker>
  )
}
