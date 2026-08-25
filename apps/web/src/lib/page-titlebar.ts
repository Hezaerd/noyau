import { ProjectId, ThreadId } from "@noyau/protocol/ids"
import type { ProjectShell, ThreadShell } from "@noyau/protocol/shell"

import { isSettingsPath, resolveSettingsTabFromPathname } from "@/lib/settings-catalog"

export const NEW_THREAD_TITLE = "Nouveau Thread"

export const threadIdFromPathname = (pathname: string): ThreadId | undefined => {
  const threadMatch = /^\/projects\/[^/]+\/thread\/([^/]+)$/.exec(pathname)
  const rawThreadId = threadMatch?.[1]
  if (rawThreadId === undefined || rawThreadId === "new") {
    return undefined
  }
  return ThreadId.make(rawThreadId)
}

export type PageTitlebar =
  | { readonly kind: "plain"; readonly title: string }
  | {
      readonly kind: "thread"
      readonly projectId: ProjectId
      readonly projectName: string | undefined
      readonly projectAvailable: boolean
      readonly threadId: ThreadId | undefined
      readonly threadTitle: string
    }
  | { readonly kind: "settings"; readonly tabLabel: string }

export const resolvePageTitlebar = (input: {
  readonly pathname: string
  readonly projects: ReadonlyArray<Pick<ProjectShell, "id" | "name" | "available">>
  readonly threads: ReadonlyArray<Pick<ThreadShell, "id" | "title">>
}): PageTitlebar => {
  const projectMatch = /^\/projects\/([^/]+)\/board$/.exec(input.pathname)
  if (projectMatch !== null) {
    return { kind: "plain", title: "Tableau" }
  }

  const threadMatch = /^\/projects\/([^/]+)\/thread\/([^/]+)$/.exec(input.pathname)
  if (threadMatch !== null) {
    const rawProjectId = threadMatch[1]
    const rawThreadId = threadMatch[2]
    if (rawProjectId === undefined) {
      return { kind: "plain", title: "Control room" }
    }
    const projectId = ProjectId.make(rawProjectId)
    const threadId =
      rawThreadId === undefined || rawThreadId === "new" ? undefined : ThreadId.make(rawThreadId)
    const project = input.projects.find((candidate) => candidate.id === projectId)
    const thread =
      threadId === undefined
        ? undefined
        : input.threads.find((candidate) => candidate.id === threadId)

    return {
      kind: "thread",
      projectId,
      projectName: project?.name,
      projectAvailable: project?.available === true,
      threadId,
      threadTitle: threadId === undefined ? NEW_THREAD_TITLE : (thread?.title ?? "Thread"),
    }
  }

  if (input.pathname === "/") {
    return { kind: "plain", title: "Tableau" }
  }

  if (isSettingsPath(input.pathname)) {
    return {
      kind: "settings",
      tabLabel: resolveSettingsTabFromPathname(input.pathname).label,
    }
  }

  return { kind: "plain", title: "Control room" }
}
