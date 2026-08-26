import { ProjectId, ThreadId } from "@noyau/protocol/ids"
import { useNavigate } from "@tanstack/react-router"
import { Option, Schema } from "effect"
import { useEffect } from "react"

import { subscribeOpenThreadFromNotification } from "@/lib/desktop-attention"

const decodeProjectId = Schema.decodeUnknownOption(ProjectId)
const decodeThreadId = Schema.decodeUnknownOption(ThreadId)

export const useOpenThreadFromNotification = (): void => {
  const navigate = useNavigate()

  useEffect(() => {
    return subscribeOpenThreadFromNotification((input) => {
      const projectId = Option.getOrUndefined(decodeProjectId(input.projectId))
      const threadId = Option.getOrUndefined(decodeThreadId(input.threadId))
      if (projectId === undefined || threadId === undefined) {
        return
      }
      void navigate({
        to: "/projects/$projectId/thread/$threadId",
        params: { projectId, threadId },
      })
    })
  }, [navigate])
}
