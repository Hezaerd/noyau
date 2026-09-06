import type { ThreadId } from "@noyau/contracts/ids"
import { Option, Schema } from "effect"

import {
  sanitizeWorkspacePanelState,
  WorkspacePanelPersisted,
  type WorkspacePanelState,
} from "@/lib/workspace-panel"

export const WORKSPACE_PANEL_STORAGE_KEY = "noyau:workspace-panel:v1"
export const WORKSPACE_PANEL_WIDTH_STORAGE_KEY = "noyau:workspace-panel-width"
export const WORKSPACE_PANEL_STORAGE_VERSION = 1
export const DEFAULT_WORKSPACE_PANEL_WIDTH = 28 * 16
export const MIN_WORKSPACE_PANEL_WIDTH = 20 * 16
/** Keep the optional panel from taking over the primary work surface. */
export const WORKSPACE_PANEL_MAX_VIEWPORT_RATIO = 0.6

export const maxWorkspacePanelWidth = (viewportWidth: number): number =>
  Math.max(0, Math.floor(viewportWidth * WORKSPACE_PANEL_MAX_VIEWPORT_RATIO))

export const minWorkspacePanelWidth = (viewportWidth: number): number =>
  Math.min(MIN_WORKSPACE_PANEL_WIDTH, maxWorkspacePanelWidth(viewportWidth))

export const clampWorkspacePanelWidth = (width: number, viewportWidth: number): number =>
  Math.min(
    maxWorkspacePanelWidth(viewportWidth),
    Math.max(minWorkspacePanelWidth(viewportWidth), width),
  )

export type WorkspacePanels = Readonly<Record<string, WorkspacePanelState>>

const decodeUuid = Schema.decodeUnknownOption(Schema.String.check(Schema.isUUID()))
const decodePanel = Schema.decodeUnknownOption(WorkspacePanelPersisted)
const RawThreadMap = Schema.Record(Schema.String, Schema.Unknown)
const decodePersistedStore = Schema.decodeUnknownOption(
  Schema.Struct({
    version: Schema.optionalKey(Schema.Finite),
    byThreadId: RawThreadMap,
  }),
)
const decodeLegacyStore = Schema.decodeUnknownOption(RawThreadMap)

const isThreadKey = (key: string): boolean => Option.isSome(decodeUuid(key))

export type WorkspaceTabKindCodecs = ReadonlySet<string>

const panelsFromRecord = (record: typeof RawThreadMap.Type, kinds: WorkspaceTabKindCodecs) => {
  const next: Record<string, WorkspacePanelState> = {}
  for (const [threadId, raw] of Object.entries(record)) {
    if (!isThreadKey(threadId)) {
      continue
    }
    const sanitized = Option.match(decodePanel(raw), {
      onNone: () => null,
      onSome: (threadState) => sanitizeWorkspacePanelState(threadState, kinds),
    })
    if (sanitized === null || (!sanitized.open && sanitized.tabs.length === 0)) {
      continue
    }
    next[threadId] = sanitized
  }
  return next
}

export const parseWorkspacePanels = (
  value: string | null,
  kinds: WorkspaceTabKindCodecs,
): WorkspacePanels => {
  if (value === null || value === "") {
    return {}
  }
  let parsed: unknown
  try {
    // SAFETY: JSON.parse is unknown until Schema.decodeUnknownOption checks the record.
    parsed = JSON.parse(value) as unknown
  } catch {
    return {}
  }
  return Option.match(decodePersistedStore(parsed), {
    onNone: () =>
      Option.match(decodeLegacyStore(parsed), {
        onNone: () => ({}),
        onSome: (record) => panelsFromRecord(record, kinds),
      }),
    onSome: (store) => panelsFromRecord(store.byThreadId, kinds),
  })
}

export const serializeWorkspacePanels = (panels: WorkspacePanels): string =>
  JSON.stringify({
    version: WORKSPACE_PANEL_STORAGE_VERSION,
    byThreadId: panels,
  })

export const readStoredWorkspacePanels = (kinds: WorkspaceTabKindCodecs): WorkspacePanels => {
  try {
    return parseWorkspacePanels(window.localStorage.getItem(WORKSPACE_PANEL_STORAGE_KEY), kinds)
  } catch {
    return {}
  }
}

export const persistWorkspacePanels = (panels: WorkspacePanels): void => {
  try {
    const persistable: Record<string, WorkspacePanelState> = {}
    for (const [threadId, state] of Object.entries(panels)) {
      if (!state.open && state.tabs.length === 0) {
        continue
      }
      persistable[threadId] = state
    }
    if (Object.keys(persistable).length === 0) {
      window.localStorage.removeItem(WORKSPACE_PANEL_STORAGE_KEY)
      return
    }
    window.localStorage.setItem(WORKSPACE_PANEL_STORAGE_KEY, serializeWorkspacePanels(persistable))
  } catch {
    // Le panneau reste actif pour cette session si le storage est indisponible.
  }
}

const decodePanelWidth = Schema.decodeUnknownOption(Schema.Finite)

export const parseWorkspacePanelWidth = (value: string | null): number => {
  if (value === null || value === "") {
    return DEFAULT_WORKSPACE_PANEL_WIDTH
  }
  return Option.match(decodePanelWidth(Number.parseInt(value, 10)), {
    onNone: () => DEFAULT_WORKSPACE_PANEL_WIDTH,
    onSome: (width) => Math.max(MIN_WORKSPACE_PANEL_WIDTH, width),
  })
}

export const readStoredWorkspacePanelWidth = (): number => {
  try {
    return parseWorkspacePanelWidth(window.localStorage.getItem(WORKSPACE_PANEL_WIDTH_STORAGE_KEY))
  } catch {
    return DEFAULT_WORKSPACE_PANEL_WIDTH
  }
}

export const persistWorkspacePanelWidth = (width: number): void => {
  try {
    if (width === DEFAULT_WORKSPACE_PANEL_WIDTH) {
      window.localStorage.removeItem(WORKSPACE_PANEL_WIDTH_STORAGE_KEY)
      return
    }
    window.localStorage.setItem(WORKSPACE_PANEL_WIDTH_STORAGE_KEY, String(width))
  } catch {
    // La largeur reste active pour cette session si le storage est indisponible.
  }
}

export const workspacePanelThreadKey = (threadId: ThreadId): string => threadId
