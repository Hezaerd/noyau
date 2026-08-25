import { LiveElapsed } from "@/components/thread/LiveElapsed"
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker"
import { Spinner } from "@/components/ui/spinner"
import { workingTranscriptLabel } from "@/lib/thread-activity"

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
          <LiveElapsed startedAtMs={startedAtMs} prefix="En cours depuis " />
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
