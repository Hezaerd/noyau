import type {
  Provider,
  ProviderInstanceView,
  ProviderInstanceViewMap,
} from "@noyau/contracts/entities/environment"
import type { ProjectId, ThreadId } from "@noyau/contracts/ids"
import type { ProjectShell, ShellSnapshot, ThreadShell } from "@noyau/contracts/shell"

import { useAppAtomValue } from "@/hooks/use-app-atom"
import type { SubscriptionStatus } from "@/lib/control-plane"
import type { LastScreen } from "@/lib/last-screen"
import {
  appliedShellAtom,
  emptyThreadIdsAtom,
  emptyThreadShellAtom,
  emptyThreadShellsAtom,
  lastProjectIdAtom,
  lastScreenAtom,
  projectThreadIdsAtom,
  projectThreadsAtom,
  projectsAtom,
  providersAtom,
  selectProject,
  selectedProjectAtom,
  subscriptionStatusAtom,
  threadShellAtom,
  threadsAtom,
} from "@/state/shell"

export const useAppliedShell = (): ShellSnapshot | undefined => useAppAtomValue(appliedShellAtom)

export const useProjects = (): ReadonlyArray<ProjectShell> => useAppAtomValue(projectsAtom)

export const useProviders = (): ProviderInstanceViewMap => useAppAtomValue(providersAtom)

export const useProvider = (id: Provider | undefined): ProviderInstanceView | undefined => {
  const providers = useProviders()
  return id === undefined ? undefined : providers[id]
}

export const useThreads = (): ReadonlyArray<ThreadShell> => useAppAtomValue(threadsAtom)

export const useSubscriptionStatus = (): SubscriptionStatus | undefined =>
  useAppAtomValue(subscriptionStatusAtom)

export const useLastProjectId = (): ProjectId | undefined => useAppAtomValue(lastProjectIdAtom)

export const useLastScreen = (): LastScreen | undefined => useAppAtomValue(lastScreenAtom)

export const useSelectedProject = (): ProjectShell | undefined =>
  useAppAtomValue(selectedProjectAtom)

export const useSelectProject = (): typeof selectProject => selectProject

export const useThreadShell = (threadId: ThreadId | undefined): ThreadShell | undefined =>
  useAppAtomValue(threadId === undefined ? emptyThreadShellAtom : threadShellAtom(threadId))

export const useProjectThreadIds = (projectId: ProjectId | undefined): ReadonlyArray<ThreadId> =>
  useAppAtomValue(projectId === undefined ? emptyThreadIdsAtom : projectThreadIdsAtom(projectId))

export const useProjectThreads = (projectId: ProjectId | undefined): ReadonlyArray<ThreadShell> =>
  useAppAtomValue(projectId === undefined ? emptyThreadShellsAtom : projectThreadsAtom(projectId))
