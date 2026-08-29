import { Marker, MarkerContent } from "@/components/ui/marker"

export function ThreadSettledMarker({ label }: { readonly label: string }) {
  return (
    <Marker role="status" className="text-xs">
      <MarkerContent className="tabular-nums">{label}</MarkerContent>
    </Marker>
  )
}
