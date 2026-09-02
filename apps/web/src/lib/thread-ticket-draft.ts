import type { TranscriptItem } from "@noyau/contracts/entities/transcript"

import { transcriptToolCaption } from "@/lib/thread-transcript"

const transcriptLine = (item: TranscriptItem): string | undefined => {
  switch (item._tag) {
    case "transcript.user": {
      const parts = [
        item.text,
        item.attachments?.map((attachment) => `[image: ${attachment.name}]`).join(" "),
      ].filter((part): part is string => part !== undefined && part.trim().length > 0)
      return parts.length === 0 ? undefined : `You:\n${parts.join("\n")}`
    }
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
