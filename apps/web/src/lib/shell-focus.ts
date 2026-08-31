import { ProjectId, ThreadId } from "@noyau/contracts/ids"
import type { ShellFocus } from "@noyau/contracts/shell"
import { Option, Schema } from "effect"

import type { LastScreen } from "@/lib/last-screen"
import { isSettingsPath } from "@/lib/settings-catalog"

const decodeProjectId = Schema.decodeUnknownOption(ProjectId)
const decodeThreadId = Schema.decodeUnknownOption(ThreadId)

export type ResolvedShellFocus = ShellFocus | { readonly _tag: "sticky" }

export const resolveShellFocus = (
  pathname: string,
  lastScreen: LastScreen | undefined,
): ResolvedShellFocus => {
  const boardMatch = /^\/projects\/([^/]+)\/board$/.exec(pathname)
  if (boardMatch !== null) {
    return Option.match(decodeProjectId(boardMatch[1]), {
      onNone: () => ({ _tag: "idle" }),
      onSome: (projectId) => ({ _tag: "tableau", projectId }),
    })
  }

  const threadMatch = /^\/projects\/([^/]+)\/thread\/([^/]+)$/.exec(pathname)
  if (threadMatch !== null) {
    return Option.match(decodeProjectId(threadMatch[1]), {
      onNone: () => ({ _tag: "idle" }),
      onSome: (projectId) => {
        if (threadMatch[2] === "new") {
          return { _tag: "tableau", projectId }
        }
        return Option.match(decodeThreadId(threadMatch[2]), {
          onNone: () => ({ _tag: "tableau", projectId }),
          onSome: (threadId) => ({ _tag: "thread", projectId, threadId }),
        })
      },
    })
  }

  if (pathname === "/" && lastScreen !== undefined) {
    return lastScreen._tag === "thread"
      ? { _tag: "thread", projectId: lastScreen.projectId, threadId: lastScreen.threadId }
      : { _tag: "tableau", projectId: lastScreen.projectId }
  }

  if (pathname === "/") {
    return { _tag: "idle" }
  }

  if (isSettingsPath(pathname)) {
    return { _tag: "sticky" }
  }

  return { _tag: "sticky" }
}
