import { ThreadId } from "@noyau/protocol/ids"
import type { ProjectShell, ThreadShell } from "@noyau/protocol/shell"

import { isSettingsPath, resolveSettingsTabFromPathname } from "@/lib/settings-catalog"

export const NEW_THREAD_TITLE = "Nouveau Thread"

export type PageTitlebar =
  | { readonly kind: "plain"; readonly title: string }
  | {
      readonly kind: "thread"
      readonly projectName: string | undefined
      readonly threadId: ThreadId | undefined
      readonly threadTitle: string
    }
  | { readonly kind: "settings"; readonly tabLabel: string }

export const resolvePageTitlebar = (input: {
  readonly pathname: string
  readonly projects: ReadonlyArray<Pick<ProjectShell, "id" | "name">>
  readonly threads: ReadonlyArray<Pick<ThreadShell, "id" | "title">>
}): PageTitlebar => {
  const projectMatch = /^\/projects\/([^/]+)\/board$/.exec(input.pathname)
  if (projectMatch !== null) {
    return { kind: "plain", title: "Tableau" }
  }

  const threadMatch = /^\/projects\/([^/]+)\/thread\/([^/]+)$/.exec(input.pathname)
  if (threadMatch !== null) {
    const projectId = threadMatch[1]
    const rawThreadId = threadMatch[2]
    const threadId =
      rawThreadId === undefined || rawThreadId === "new" ? undefined : ThreadId.make(rawThreadId)
    const project = input.projects.find((candidate) => candidate.id === projectId)
    const thread =
      threadId === undefined
        ? undefined
        : input.threads.find((candidate) => candidate.id === threadId)

    return {
      kind: "thread",
      projectName: project?.name,
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
