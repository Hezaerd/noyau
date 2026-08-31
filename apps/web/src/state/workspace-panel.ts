import type { ThreadId } from "@noyau/contracts/ids"
import { Atom } from "effect/unstable/reactivity"

import {
  activateWorkspaceTabInState,
  closeAllWorkspaceTabsInState,
  closeOtherWorkspaceTabsInState,
  closeWorkspaceTabInState,
  closeWorkspaceTabsToRightInState,
  emptyWorkspacePanel,
  openWorkspaceTabInState,
  patchWorkspaceTabPayloadInState,
  setWorkspacePanelOpenInState,
  toggleWorkspacePanelInState,
  type WorkspacePanelState,
  type WorkspaceTabKind,
  type WorkspaceTabPayload,
} from "@/lib/workspace-panel"
import {
  persistWorkspacePanels,
  persistWorkspacePanelWidth,
  readStoredWorkspacePanelWidth,
  readStoredWorkspacePanels,
  type WorkspacePanels,
  type WorkspaceTabKindCodecs,
} from "@/lib/workspace-panel-persist"
import { appAtomRegistry } from "@/state/atom-registry"
import { persistWritableAtom } from "@/state/persist"

export const workspacePanelsAtom = Atom.make<WorkspacePanels>({}).pipe(
  Atom.keepAlive,
  Atom.withLabel("chrome:workspace-panels"),
)

export const workspacePanelWidthAtom = Atom.make(28 * 16).pipe(
  Atom.keepAlive,
  Atom.withLabel("chrome:workspace-panel-width"),
)

export const workspacePanelAtom = Atom.family((threadId: ThreadId) =>
  Atom.make(
    (get): WorkspacePanelState => get(workspacePanelsAtom)[threadId] ?? emptyWorkspacePanel,
  ).pipe(Atom.withLabel(`chrome:workspace-panel:${threadId}`)),
)

let initialized = false

export const initializeWorkspacePanel = (kinds: WorkspaceTabKindCodecs): void => {
  if (initialized) {
    return
  }
  initialized = true
  persistWritableAtom(workspacePanelsAtom, {
    read: () => readStoredWorkspacePanels(kinds),
    write: persistWorkspacePanels,
  })
  persistWritableAtom(workspacePanelWidthAtom, {
    read: readStoredWorkspacePanelWidth,
    write: persistWorkspacePanelWidth,
  })
}

const writeThread = (
  threadId: ThreadId,
  updater: (current: WorkspacePanelState) => WorkspacePanelState,
): WorkspacePanelState => {
  const current = appAtomRegistry.get(workspacePanelsAtom)
  const existing = current[threadId] ?? emptyWorkspacePanel
  const nextState = updater(existing)
  if (nextState === existing) {
    return existing
  }
  if (!nextState.open && nextState.tabs.length === 0) {
    if (!(threadId in current)) {
      return nextState
    }
    const { [threadId]: _removed, ...rest } = current
    appAtomRegistry.set(workspacePanelsAtom, rest)
    return nextState
  }
  appAtomRegistry.set(workspacePanelsAtom, { ...current, [threadId]: nextState })
  return nextState
}

export const getWorkspacePanel = (threadId: ThreadId): WorkspacePanelState =>
  appAtomRegistry.get(workspacePanelAtom(threadId))

export const openWorkspaceTab = (threadId: ThreadId, kind: WorkspaceTabKind): string =>
  openWorkspaceTabWith(threadId, kind, undefined)

export const openWorkspaceTabWith = <
  Kind extends string,
  Payload extends WorkspaceTabPayload,
  Input,
>(
  threadId: ThreadId,
  kind: WorkspaceTabKind<Kind, Payload, Input>,
  input: Input,
): string => {
  const tabId = crypto.randomUUID()
  const next = writeThread(threadId, (state) => openWorkspaceTabInState(state, kind, tabId, input))
  return next.activeTabId ?? tabId
}

export const activateWorkspaceTab = (threadId: ThreadId, tabId: string): void => {
  writeThread(threadId, (state) => activateWorkspaceTabInState(state, tabId))
}

export const closeWorkspaceTab = (threadId: ThreadId, tabId: string): void => {
  writeThread(threadId, (state) => closeWorkspaceTabInState(state, tabId))
}

export const closeOtherWorkspaceTabs = (threadId: ThreadId, tabId: string): void => {
  writeThread(threadId, (state) => closeOtherWorkspaceTabsInState(state, tabId))
}

export const closeWorkspaceTabsToRight = (threadId: ThreadId, tabId: string): void => {
  writeThread(threadId, (state) => closeWorkspaceTabsToRightInState(state, tabId))
}

export const closeAllWorkspaceTabs = (threadId: ThreadId): void => {
  writeThread(threadId, (state) => closeAllWorkspaceTabsInState(state))
}

export const patchWorkspaceTabPayload = (
  threadId: ThreadId,
  tabId: string,
  patch: WorkspaceTabPayload,
): void => {
  writeThread(threadId, (state) => patchWorkspaceTabPayloadInState(state, tabId, patch))
}

export const setWorkspacePanelOpen = (threadId: ThreadId, open: boolean): void => {
  writeThread(threadId, (state) => setWorkspacePanelOpenInState(state, open))
}

export const toggleWorkspacePanel = (threadId: ThreadId): void => {
  writeThread(threadId, (state) => toggleWorkspacePanelInState(state))
}

export const setWorkspacePanelWidth = (width: number): void => {
  if (width === appAtomRegistry.get(workspacePanelWidthAtom)) {
    return
  }
  appAtomRegistry.set(workspacePanelWidthAtom, width)
}
