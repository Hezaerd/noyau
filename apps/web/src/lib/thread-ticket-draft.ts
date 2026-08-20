import type { TranscriptItem } from "@noyau/protocol/entities/transcript"

import { transcriptToolCaption } from "@/lib/thread-transcript"

const transcriptLine = (item: TranscriptItem): string | undefined => {
  switch (item._tag) {
    case "transcript.user":
      return `You:\n${item.text}`
    case "transcript.assistant":
      return `Cursor:\n${item.text}`
    case "transcript.plan":
      return `Plan:\n${item.markdown}`
    case "transcript.tool":
      return `Cursor · ${transcriptToolCaption(item)}`
    case "transcript.permission":
      return `Permission request: ${item.status}`
    case "transcript.user-input":
      return `Question from Cursor: ${item.prompt ?? item.status}`
  }
}

export const threadTicketDescription = (transcript: ReadonlyArray<TranscriptItem>): string =>
  transcript
    .map(transcriptLine)
    .filter((line) => line !== undefined)
    .join("\n\n")
