import type { RuntimeMode } from "@noyau/protocol/entities/runtime-mode"
import type { SessionStatus } from "@noyau/protocol/entities/session"
import type { LatestTurn } from "@noyau/protocol/entities/turn"
import type { VcsStatusPullRequest } from "@noyau/protocol/git"

import { runtimeModes } from "./thread-commands"
import { pullRequestStateLabel } from "./vcs-status"

export type ThreadSidebarPopoverRowKind =
  | "project"
  | "workspace"
  | "branch"
  | "provider"
  | "runtimeMode"
  | "pullRequest"
  | "status"
  | "error"

export type ThreadSidebarPopoverRow = {
  readonly kind: ThreadSidebarPopoverRowKind
  readonly label: string
}

const providerLabels = {
  cursor: "Cursor",
} as const

const busySessionStatuses = new Set<SessionStatus>(["starting", "running"])
const visibleTurnStates = new Set<LatestTurn["state"]>(["running", "interrupted", "error"])

export const workspaceFolderName = (workspaceRoot: string): string => {
  const normalized = workspaceRoot.replace(/[\\/]+$/, "")
  const segments = normalized.split(/[\\/]/).filter((segment) => segment.length > 0)
  return segments.at(-1) ?? workspaceRoot
}

export const runtimeModeLabel = (runtimeMode: RuntimeMode): string =>
  runtimeModes.find((mode) => mode.value === runtimeMode)?.label ?? runtimeMode

export const threadStatusLabel = (
  sessionStatus: SessionStatus | null,
  latestTurn: Pick<LatestTurn, "state" | "completedAt"> | null,
): string | undefined => {
  if (latestTurn?.state === "completed") {
    return undefined
  }
  if (latestTurn?.completedAt != null && latestTurn.state !== "error") {
    return latestTurn.state === "interrupted" ? "Interrompu" : undefined
  }
  if (latestTurn !== null && visibleTurnStates.has(latestTurn.state)) {
    switch (latestTurn.state) {
      case "running":
        return "En cours"
      case "interrupted":
        return "Interrompu"
      case "error":
        return "Erreur"
      default:
        break
    }
  }
  if (sessionStatus === "error") {
    return "Erreur"
  }
  if (sessionStatus !== null && busySessionStatuses.has(sessionStatus)) {
    return "En cours"
  }
  return undefined
}

export const threadSidebarPopoverRows = (input: {
  readonly projectName: string
  readonly workspaceRoot: string
  readonly branch?: string | null
  readonly provider: keyof typeof providerLabels
  readonly runtimeMode: RuntimeMode
  readonly sessionStatus: SessionStatus | null
  readonly latestTurn: Pick<LatestTurn, "state" | "completedAt"> | null
  readonly lastError: string | null
  readonly pullRequest: VcsStatusPullRequest | null
}): ReadonlyArray<ThreadSidebarPopoverRow> => {
  const folderName = workspaceFolderName(input.workspaceRoot)
  const status = threadStatusLabel(input.sessionStatus, input.latestTurn)
  const rows: Array<ThreadSidebarPopoverRow> = [{ kind: "project", label: input.projectName }]
  if (folderName !== input.projectName) {
    rows.push({ kind: "workspace", label: folderName })
  }
  if (input.branch != null && input.branch !== "") {
    rows.push({ kind: "branch", label: input.branch })
  }
  rows.push(
    { kind: "provider", label: providerLabels[input.provider] },
    { kind: "runtimeMode", label: runtimeModeLabel(input.runtimeMode) },
  )
  if (input.pullRequest != null) {
    rows.push({
      kind: "pullRequest",
      label: `#${input.pullRequest.number} · ${pullRequestStateLabel(input.pullRequest.state)}`,
    })
  }
  if (status !== undefined) {
    rows.push({ kind: "status", label: status })
  }
  if (input.lastError !== null) {
    rows.push({ kind: "error", label: input.lastError })
  }
  return rows
}
