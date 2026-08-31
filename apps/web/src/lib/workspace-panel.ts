/** Chrome du panneau droit : un onglet = un id, le kind ne sert qu’au rendu. */

import { Option, Schema } from "effect"

export const WorkspaceTabPayload = Schema.Record(
  Schema.String,
  Schema.Union([Schema.String, Schema.Finite, Schema.Boolean, Schema.Null]),
)
export type WorkspaceTabPayload = typeof WorkspaceTabPayload.Type

export type WorkspaceTab<
  Kind extends string = string,
  Payload extends WorkspaceTabPayload = WorkspaceTabPayload,
> = {
  readonly id: string
  readonly kind: Kind
  readonly payload: Payload
  readonly identity: string | null
}

export type WorkspacePanelState = {
  readonly open: boolean
  readonly tabs: readonly WorkspaceTab[]
  readonly activeTabId: string | null
}

export const emptyWorkspacePanel: WorkspacePanelState = {
  open: false,
  tabs: [],
  activeTabId: null,
}

export const WorkspaceTabPersisted = Schema.Struct({
  id: Schema.NonEmptyString,
  kind: Schema.NonEmptyString,
  payload: Schema.Unknown,
  identity: Schema.optionalKey(Schema.NullOr(Schema.String)),
})

const decodeTabPayload = Schema.decodeUnknownOption(WorkspaceTabPayload)

export const WorkspacePanelPersisted = Schema.Struct({
  open: Schema.Boolean,
  activeTabId: Schema.NullOr(Schema.String),
  tabs: Schema.Array(WorkspaceTabPersisted),
})

export type WorkspaceTabKind<
  Kind extends string = string,
  Payload extends WorkspaceTabPayload = WorkspaceTabPayload,
  Input = undefined,
> = {
  readonly kind: Kind
  readonly label: string
  readonly create: (tabId: string, input: Input) => Payload
  readonly keepMounted?: boolean
  identityOf?(payload: Payload): string
}

/** Fige le kind : l’objet retourné est le token passé à open / au catalogue. */
export const defineWorkspaceTabKind = <
  Kind extends string,
  Payload extends WorkspaceTabPayload,
  Input = undefined,
>(
  definition: WorkspaceTabKind<Kind, Payload, Input>,
): WorkspaceTabKind<Kind, Payload, Input> => definition

export const resolveActiveWorkspaceTab = (state: WorkspacePanelState): WorkspaceTab | null => {
  if (!state.open || state.activeTabId === null) {
    return null
  }
  return state.tabs.find((tab) => tab.id === state.activeTabId) ?? null
}

const resolveActiveAfterRemoval = (
  tabs: readonly WorkspaceTab[],
  removedIndex: number,
  previousActiveId: string | null,
  removedId: string,
): string | null => {
  if (previousActiveId !== removedId) {
    return previousActiveId
  }
  if (tabs.length === 0) {
    return null
  }
  return tabs[Math.min(removedIndex, tabs.length - 1)]?.id ?? null
}

/** Ouvre un onglet réel. Sans identityOf, chaque appel crée une instance. */
export const openWorkspaceTabInState = <
  Kind extends string,
  Payload extends WorkspaceTabPayload,
  Input,
>(
  state: WorkspacePanelState,
  kind: WorkspaceTabKind<Kind, Payload, Input>,
  tabId: string,
  input: Input,
): WorkspacePanelState => {
  const payload = kind.create(tabId, input)
  const identity = kind.identityOf?.(payload) ?? null
  if (identity !== null) {
    const existing = state.tabs.find((tab) => tab.kind === kind.kind && tab.identity === identity)
    if (existing !== undefined) {
      return { open: true, tabs: state.tabs, activeTabId: existing.id }
    }
  }
  return {
    open: true,
    tabs: [...state.tabs, { id: tabId, kind: kind.kind, payload, identity }],
    activeTabId: tabId,
  }
}

export const activateWorkspaceTabInState = (
  state: WorkspacePanelState,
  tabId: string,
): WorkspacePanelState => {
  if (!state.tabs.some((tab) => tab.id === tabId)) {
    return state
  }
  return { ...state, open: true, activeTabId: tabId }
}

export const closeWorkspaceTabInState = (
  state: WorkspacePanelState,
  tabId: string,
): WorkspacePanelState => {
  const removedIndex = state.tabs.findIndex((tab) => tab.id === tabId)
  if (removedIndex < 0) {
    return state
  }
  const tabs = state.tabs.filter((tab) => tab.id !== tabId)
  return {
    open: state.open,
    tabs,
    activeTabId: resolveActiveAfterRemoval(tabs, removedIndex, state.activeTabId, tabId),
  }
}

export const closeOtherWorkspaceTabsInState = (
  state: WorkspacePanelState,
  tabId: string,
): WorkspacePanelState => {
  const tab = state.tabs.find((entry) => entry.id === tabId)
  if (tab === undefined || state.tabs.length === 1) {
    return state
  }
  return { open: true, tabs: [tab], activeTabId: tab.id }
}

export const closeWorkspaceTabsToRightInState = (
  state: WorkspacePanelState,
  tabId: string,
): WorkspacePanelState => {
  const index = state.tabs.findIndex((tab) => tab.id === tabId)
  if (index < 0 || index === state.tabs.length - 1) {
    return state
  }
  const tabs = state.tabs.slice(0, index + 1)
  const activeStillExists = tabs.some((tab) => tab.id === state.activeTabId)
  return {
    ...state,
    tabs,
    activeTabId: activeStillExists ? state.activeTabId : tabId,
  }
}

export const closeAllWorkspaceTabsInState = (state: WorkspacePanelState): WorkspacePanelState => {
  if (state.tabs.length === 0) {
    return state
  }
  return { open: state.open, tabs: [], activeTabId: null }
}

/** Met à jour le payload d’un onglet déjà créé. L’identité ne change pas. */
export const patchWorkspaceTabPayloadInState = (
  state: WorkspacePanelState,
  tabId: string,
  patch: WorkspaceTabPayload,
): WorkspacePanelState => {
  const index = state.tabs.findIndex((tab) => tab.id === tabId)
  if (index < 0) {
    return state
  }
  const current = state.tabs[index]
  if (current === undefined) {
    return state
  }
  const payload = { ...current.payload, ...patch }
  if (
    Object.keys(payload).length === Object.keys(current.payload).length &&
    Object.entries(payload).every(([key, value]) => current.payload[key] === value)
  ) {
    return state
  }
  return {
    ...state,
    tabs: state.tabs.map((tab, tabIndex) => (tabIndex === index ? { ...tab, payload } : tab)),
  }
}

export const setWorkspacePanelOpenInState = (
  state: WorkspacePanelState,
  open: boolean,
): WorkspacePanelState => (state.open === open ? state : { ...state, open })

export const toggleWorkspacePanelInState = (state: WorkspacePanelState): WorkspacePanelState => ({
  ...state,
  open: !state.open,
})

export const EMPTY_TAB_ID_SET: ReadonlySet<string> = new Set()

/** Les kinds keepMounted déjà hydratés restent montés ; les autres se démontent. */
export const reconcileKeepMountedTabIds = (input: {
  readonly previous: ReadonlySet<string>
  readonly tabs: readonly WorkspaceTab[]
  readonly activeTabId: string | null
  readonly keepMountedKinds: ReadonlySet<string>
}): ReadonlySet<string> => {
  const liveTabIds = new Set(input.tabs.map((tab) => tab.id))
  const next = new Set<string>()
  for (const tabId of input.previous) {
    if (liveTabIds.has(tabId)) {
      next.add(tabId)
    }
  }
  const active = input.tabs.find((tab) => tab.id === input.activeTabId)
  if (active !== undefined && input.keepMountedKinds.has(active.kind)) {
    next.add(active.id)
  }
  return next
}

export const sanitizeWorkspacePanelState = (
  persisted: typeof WorkspacePanelPersisted.Type,
  knownKinds: ReadonlySet<string>,
): WorkspacePanelState => {
  const tabs = persisted.tabs.flatMap((tab) => {
    if (!knownKinds.has(tab.kind)) {
      return []
    }
    return Option.match(decodeTabPayload(tab.payload), {
      onNone: () => [],
      onSome: (payload) => [
        {
          id: tab.id,
          kind: tab.kind,
          payload,
          identity: tab.identity === undefined ? null : tab.identity,
        },
      ],
    })
  })
  const activeTabId =
    persisted.activeTabId !== null && tabs.some((tab) => tab.id === persisted.activeTabId)
      ? persisted.activeTabId
      : (tabs[0]?.id ?? null)
  return {
    open: persisted.open,
    tabs,
    activeTabId,
  }
}
