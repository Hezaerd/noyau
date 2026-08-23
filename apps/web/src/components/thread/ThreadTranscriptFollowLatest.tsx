import { useLayoutEffect } from "react"

import { useMessageScroller } from "@/components/ui/message-scroller"

export function ThreadTranscriptFollowLatest({
  followLatestKey,
}: {
  readonly followLatestKey: number
}) {
  const { scrollToEnd } = useMessageScroller()

  useLayoutEffect(() => {
    if (followLatestKey === 0) {
      return
    }
    scrollToEnd()
  }, [followLatestKey, scrollToEnd])

  return null
}
