import type { DateTime } from "effect"

import { MessageCopyButton } from "@/components/thread/MessageCopyButton"
import { MessageFooter } from "@/components/ui/message"
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip"
import {
  formatTranscriptMessageAt,
  formatTranscriptMessageAtTooltip,
} from "@/lib/transcript-message-at"

export function ThreadMessageMeta({
  align,
  at,
  copyText,
}: {
  readonly align: "start" | "end"
  readonly at?: DateTime.Utc | undefined
  readonly copyText?: string | undefined
}) {
  const hasCopy = copyText !== undefined && copyText.length > 0
  if (at === undefined && !hasCopy) {
    return null
  }

  const timestamp =
    at === undefined ? null : (
      <Tooltip>
        <TooltipTrigger render={<p className="text-xs tabular-nums" />}>
          {formatTranscriptMessageAt(at)}
        </TooltipTrigger>
        <TooltipPopup>{formatTranscriptMessageAtTooltip(at)}</TooltipPopup>
      </Tooltip>
    )
  const copy = hasCopy ? <MessageCopyButton text={copyText} /> : null

  return (
    <MessageFooter className="-mt-1.5 gap-2 px-1 font-normal opacity-0 transition-opacity duration-200 group-focus-within/message:opacity-100 group-hover/message:opacity-100">
      {align === "end" ? (
        <>
          {timestamp}
          {copy}
        </>
      ) : (
        <>
          {copy}
          {timestamp}
        </>
      )}
    </MessageFooter>
  )
}
