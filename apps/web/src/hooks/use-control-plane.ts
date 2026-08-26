import { useAtomValue } from "@effect/atom-react"
import type {
  ClaudeProviderStatus,
  CodexProviderStatus,
  CursorProviderStatus,
} from "@noyau/protocol/entities/environment"
import type { ProjectId, ThreadId } from "@noyau/protocol/ids"
import type { ProjectShell, ShellSnapshot, ThreadShell } from "@noyau/protocol/shell"

import type { SubscriptionStatus } from "@/lib/control-plane"
import {
  appliedShellAtom,
  cursorAtom,
  claudeAtom,
  codexAtom,
  emptyThreadIdsAtom,
  emptyThreadShellAtom,
  emptyThreadShellsAtom,
  lastProjectIdAtom,
  projectThreadIdsAtom,
  projectThreadsAtom,
  projectsAtom,
  selectProject,
  selectedProjectAtom,
  subscriptionStatusAtom,
  threadShellAtom,
  threadsAtom,
} from "@/state/shell"

export const useAppliedShell = (): ShellSnapshot | undefined => useAtomValue(appliedShellAtom)

export const useProjects = (): ReadonlyArray<ProjectShell> => useAtomValue(projectsAtom)

export const useCursor = (): CursorProviderStatus | undefined => useAtomValue(cursorAtom)

export const useClaude = (): ClaudeProviderStatus | undefined => useAtomValue(claudeAtom)

export const useCodex = (): CodexProviderStatus | undefined => useAtomValue(codexAtom)

export const useThreads = (): ReadonlyArray<ThreadShell> => useAtomValue(threadsAtom)

export const useSubscriptionStatus = (): SubscriptionStatus | undefined =>
  useAtomValue(subscriptionStatusAtom)

export const useLastProjectId = (): ProjectId | undefined => useAtomValue(lastProjectIdAtom)

export const useSelectedProject = (): ProjectShell | undefined => useAtomValue(selectedProjectAtom)

export const useSelectProject = (): typeof selectProject => selectProject

export const useThreadShell = (threadId: ThreadId | undefined): ThreadShell | undefined =>
  useAtomValue(threadId === undefined ? emptyThreadShellAtom : threadShellAtom(threadId))

export const useProjectThreadIds = (projectId: ProjectId | undefined): ReadonlyArray<ThreadId> =>
  useAtomValue(projectId === undefined ? emptyThreadIdsAtom : projectThreadIdsAtom(projectId))

export const useProjectThreads = (projectId: ProjectId | undefined): ReadonlyArray<ThreadShell> =>
  useAtomValue(projectId === undefined ? emptyThreadShellsAtom : projectThreadsAtom(projectId))
