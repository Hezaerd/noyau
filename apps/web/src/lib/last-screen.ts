import { ProjectId, ThreadId } from "@noyau/contracts/ids"
import { Option, Schema } from "effect"

import { LAST_PROJECT_STORAGE_KEY } from "@/lib/control-plane-state"

export const LAST_SCREEN_STORAGE_KEY = "noyau:last-screen"

const LastScreenStored = Schema.Union([
  Schema.TaggedStruct("board", {
    projectId: ProjectId,
  }),
  Schema.TaggedStruct("new-thread", {
    projectId: ProjectId,
    draftId: Schema.optionalKey(Schema.String.check(Schema.isUUID())),
  }),
  Schema.TaggedStruct("thread", {
    projectId: ProjectId,
    threadId: ThreadId,
  }),
])

const decodeLastScreen = Schema.decodeUnknownOption(LastScreenStored)
const decodeProjectId = Schema.decodeUnknownOption(ProjectId)
const decodeThreadId = Schema.decodeUnknownOption(ThreadId)

export type LastScreen = (typeof LastScreenStored)["Type"]

export type StartupDestination = { readonly _tag: "home" } | LastScreen

export type StartupNavigateTarget =
  | {
      readonly to: "/projects/$projectId/board"
      readonly params: { readonly projectId: ProjectId }
    }
  | {
      readonly to: "/projects/$projectId/thread/$threadId"
      readonly params: { readonly projectId: ProjectId; readonly threadId: ThreadId | "new" }
      readonly search?: { readonly draft?: string }
    }

type ProjectRef = { readonly id: ProjectId }
type ThreadRef = { readonly id: ThreadId; readonly projectId: ProjectId }

export const lastScreensEqual = (
  left: LastScreen | undefined,
  right: LastScreen | undefined,
): boolean => {
  if (left === right) {
    return true
  }
  if (left === undefined || right === undefined || left._tag !== right._tag) {
    return false
  }
  if (left.projectId !== right.projectId) {
    return false
  }
  if (left._tag === "thread" && right._tag === "thread") {
    return left.threadId === right.threadId
  }
  return left._tag === "new-thread" && right._tag === "new-thread"
    ? left.draftId === right.draftId
    : true
}

export const parseLastScreen = (value: string | null): LastScreen | undefined => {
  if (value === null || value === "") {
    return undefined
  }
  let parsed: unknown
  try {
    // SAFETY: JSON.parse is unknown until Schema.decodeUnknownOption checks the record.
    parsed = JSON.parse(value) as unknown
  } catch {
    return undefined
  }
  return Option.getOrUndefined(decodeLastScreen(parsed))
}

export const serializeLastScreen = (screen: LastScreen): string => JSON.stringify(screen)

export const lastScreenFromLegacyProjectId = (value: string | null): LastScreen | undefined =>
  Option.match(decodeProjectId(value), {
    onNone: () => undefined,
    onSome: (projectId) => ({ _tag: "board", projectId }),
  })

export const lastScreenFromPathname = (pathname: string, search = ""): LastScreen | undefined => {
  const boardMatch = /^\/projects\/([^/]+)\/board$/.exec(pathname)
  if (boardMatch !== null) {
    return Option.match(decodeProjectId(boardMatch[1]), {
      onNone: () => undefined,
      onSome: (projectId) => ({ _tag: "board", projectId }),
    })
  }

  const threadMatch = /^\/projects\/([^/]+)\/thread\/([^/]+)$/.exec(pathname)
  if (threadMatch === null) {
    return undefined
  }
  return Option.match(decodeProjectId(threadMatch[1]), {
    onNone: () => undefined,
    onSome: (projectId) => {
      if (threadMatch[2] === "new") {
        const draftId = new URLSearchParams(search).get("draft")
        return draftId !== null && Option.isSome(decodeThreadId(draftId))
          ? { _tag: "new-thread", projectId, draftId }
          : { _tag: "new-thread", projectId }
      }
      return Option.match(decodeThreadId(threadMatch[2]), {
        onNone: () => undefined,
        onSome: (threadId) => ({ _tag: "thread", projectId, threadId }),
      })
    },
  })
}

export const reconcileLastScreen = (
  lastScreen: LastScreen | undefined,
  projects: ReadonlyArray<ProjectRef>,
  threads: ReadonlyArray<ThreadRef>,
): LastScreen | undefined => {
  if (lastScreen === undefined) {
    return undefined
  }
  if (!projects.some((project) => project.id === lastScreen.projectId)) {
    return undefined
  }
  if (lastScreen._tag !== "thread") {
    return lastScreen
  }
  const thread = threads.find((candidate) => candidate.id === lastScreen.threadId)
  if (thread === undefined || thread.projectId !== lastScreen.projectId) {
    return { _tag: "board", projectId: lastScreen.projectId }
  }
  return lastScreen
}

export const resolveStartupDestination = (
  lastScreen: LastScreen | undefined,
  projects: ReadonlyArray<ProjectRef>,
  threads: ReadonlyArray<ThreadRef>,
): StartupDestination => reconcileLastScreen(lastScreen, projects, threads) ?? { _tag: "home" }

export const startupNavigateTarget = (destination: LastScreen): StartupNavigateTarget => {
  switch (destination._tag) {
    case "board":
      return {
        to: "/projects/$projectId/board",
        params: { projectId: destination.projectId },
      }
    case "new-thread":
      return Object.assign(
        {
          to: "/projects/$projectId/thread/$threadId" as const,
          params: { projectId: destination.projectId, threadId: "new" as const },
        },
        destination.draftId === undefined ? {} : { search: { draft: destination.draftId } },
      )
    case "thread":
      return {
        to: "/projects/$projectId/thread/$threadId",
        params: { projectId: destination.projectId, threadId: destination.threadId },
      }
  }
}

export const shouldHoldBootSplash = (input: {
  readonly pathname: string
  readonly shellReady: boolean
  readonly subscriptionFailed: boolean
  readonly destination: StartupDestination | undefined
}): boolean => {
  if (input.subscriptionFailed) {
    return false
  }
  if (!input.shellReady) {
    return true
  }
  return (
    input.pathname === "/" && input.destination !== undefined && input.destination._tag !== "home"
  )
}

export const readLastScreen = (): LastScreen | undefined => {
  try {
    const stored = parseLastScreen(window.localStorage.getItem(LAST_SCREEN_STORAGE_KEY))
    if (stored !== undefined) {
      return stored
    }
    return lastScreenFromLegacyProjectId(window.localStorage.getItem(LAST_PROJECT_STORAGE_KEY))
  } catch {
    return undefined
  }
}

export const writeLastScreen = (screen: LastScreen | undefined): void => {
  try {
    if (screen === undefined) {
      window.localStorage.removeItem(LAST_SCREEN_STORAGE_KEY)
      window.localStorage.removeItem(LAST_PROJECT_STORAGE_KEY)
      return
    }
    window.localStorage.setItem(LAST_SCREEN_STORAGE_KEY, serializeLastScreen(screen))
    window.localStorage.removeItem(LAST_PROJECT_STORAGE_KEY)
  } catch {
    // Persistence is best effort; the server remains authoritative.
  }
}
