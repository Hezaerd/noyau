import type { TranscriptTool, TranscriptToolAction } from "@noyau/protocol/entities/transcript"
import { CheckIcon, ChevronRightIcon, XIcon } from "lucide-react"
import { useId, useState } from "react"

import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker"
import { Spinner } from "@/components/ui/spinner"
import {
  transcriptToolGroupLabel,
  transcriptToolObject,
  transcriptToolVerb,
} from "@/lib/thread-transcript"
import { cn } from "@/lib/utils"

const toolStatusIcon = (status: TranscriptTool["status"]) => {
  switch (status) {
    case "in_progress":
      return <Spinner />
    case "error":
      return <XIcon className="text-destructive" />
    case "completed":
      return <CheckIcon />
  }
}

export function ThreadTranscriptTool({ item }: { readonly item: TranscriptTool }) {
  const object = transcriptToolObject(item)
  return (
    <Marker role="status">
      <MarkerIcon>{toolStatusIcon(item.status)}</MarkerIcon>
      <MarkerContent className="flex min-w-0 items-center gap-2">
        <span className="shrink-0">{transcriptToolVerb(item)}</span>
        {object === undefined ? null : (
          <span className="truncate font-mono text-foreground/90">{object}</span>
        )}
      </MarkerContent>
    </Marker>
  )
}

export function ThreadTranscriptToolGroup({
  action,
  items,
}: {
  readonly action: TranscriptToolAction
  readonly items: ReadonlyArray<TranscriptTool>
}) {
  const listId = useId()
  const hasInProgress = items.some((item) => item.status === "in_progress")
  const [userExpanded, setUserExpanded] = useState<boolean | null>(null)
  const expanded = userExpanded ?? hasInProgress
  const label = transcriptToolGroupLabel(action, items.length)

  return (
    <div>
      <Marker
        render={
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={listId}
            onClick={() => {
              setUserExpanded(!expanded)
            }}
          />
        }
      >
        <MarkerIcon>
          <ChevronRightIcon className={cn("transition-transform", expanded && "rotate-90")} />
        </MarkerIcon>
        <MarkerContent>{label}</MarkerContent>
      </Marker>
      {expanded ? (
        <ul id={listId} className="pl-6">
          {items.map((item) => (
            <li key={item.toolCallId}>
              <ThreadTranscriptTool item={item} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
