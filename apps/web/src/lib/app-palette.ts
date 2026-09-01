import { Option, Schema } from "effect"

import {
  isComposerDraftEmpty,
  type NewThreadDraft,
  type NewThreadDraftId,
} from "@/lib/composer-drafts"
import { newThreadDraftTitle } from "@/lib/draft-thread"

export const MAX_PALETTE_RECENTS = 5

export const NEW_THREAD_PALETTE_THREAD_ID = "new"

export interface PaletteItem {
  readonly id: string
}

export interface PaletteGroup<TItem extends PaletteItem> {
  readonly id: "recents" | "actions" | "navigation" | "tickets" | "threads"
  readonly label: "Recents" | "Actions" | "Navigation" | "Tickets" | "Threads"
  readonly items: ReadonlyArray<TItem>
}

export interface PaletteThreadSource {
  readonly id: string
  readonly title: string
  readonly projectId: string
  readonly status: string
}

export interface PaletteThreadItem {
  readonly id: string
  readonly threadId: string
  readonly draftId?: NewThreadDraftId | undefined
  readonly label: string
  readonly searchValue: string
}

export const paletteNewThreadDraftItem = (
  projectId: string | undefined,
  draft: NewThreadDraft<{ readonly upload: { readonly name: string } }>,
): PaletteThreadItem | undefined => {
  if (projectId === undefined || isComposerDraftEmpty(draft.value)) {
    return undefined
  }
  const label = newThreadDraftTitle(draft.value)
  return {
    id: `thread.open.new.${projectId}.${draft.id ?? "legacy"}`,
    threadId: NEW_THREAD_PALETTE_THREAD_ID,
    draftId: draft.id,
    label,
    searchValue: `${label} draft new thread`,
  }
}

export const paletteThreadItems = (
  threads: ReadonlyArray<PaletteThreadSource>,
  projectId: string | undefined,
  drafts: ReadonlyArray<NewThreadDraft<{ readonly upload: { readonly name: string } }>> = [],
): ReadonlyArray<PaletteThreadItem> => {
  if (projectId === undefined) {
    return []
  }
  const persisted = threads.flatMap((thread) =>
    thread.projectId === projectId && thread.status === "active"
      ? [
          {
            id: `thread.open.${thread.id}`,
            threadId: thread.id,
            label: thread.title,
            searchValue: thread.title,
          },
        ]
      : [],
  )
  const unsaved = drafts.flatMap((draft) => {
    const item = paletteNewThreadDraftItem(projectId, draft)
    return item === undefined ? [] : [item]
  })
  return [...unsaved, ...persisted]
}

export interface SearchablePaletteItem extends PaletteItem {
  readonly searchValue: string
}

const RecentActionIdsJson = Schema.fromJsonString(Schema.Array(Schema.String))
const decodeRecentActionIds = Schema.decodeUnknownOption(RecentActionIdsJson)
const encodeRecentActionIds = Schema.encodeSync(RecentActionIdsJson)

export const parseRecentActionIds = (value: string | null): ReadonlyArray<string> =>
  Option.getOrElse(decodeRecentActionIds(value ?? "[]"), () => [])

export const serializeRecentActionIds = (ids: ReadonlyArray<string>): string =>
  encodeRecentActionIds([...ids])

export const paletteShortcutIndex = (code: string): number | undefined => {
  if (!code.startsWith("Digit")) {
    return undefined
  }
  const number = Number(code.slice(5))
  return Number.isInteger(number) && number >= 1 && number <= 9 ? number - 1 : undefined
}

const normalizePaletteQuery = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("en")
    .trim()

export const filterPaletteGroups = <TItem extends SearchablePaletteItem>(
  groups: ReadonlyArray<PaletteGroup<TItem>>,
  query: string,
): ReadonlyArray<PaletteGroup<TItem>> => {
  const normalizedQuery = normalizePaletteQuery(query)
  if (normalizedQuery === "") {
    return groups
  }
  return groups.flatMap((group) => {
    const items = group.items.filter((item) =>
      normalizePaletteQuery(item.searchValue).includes(normalizedQuery),
    )
    return items.length === 0 ? [] : [{ ...group, items }]
  })
}

export const updateRecentActionIds = (
  recentIds: ReadonlyArray<string>,
  actionId: string,
  limit = MAX_PALETTE_RECENTS,
): ReadonlyArray<string> =>
  [actionId, ...recentIds.filter((candidate) => candidate !== actionId)].slice(0, limit)

export const applicableRecentActionIds = (
  recentIds: ReadonlyArray<string>,
  catalogue: ReadonlyArray<PaletteItem>,
): ReadonlyArray<string> => {
  const applicableIds = new Set(catalogue.map((item) => item.id))
  return recentIds.filter((id) => applicableIds.has(id))
}

export const buildPaletteGroups = <TItem extends PaletteItem>(
  pageActions: ReadonlyArray<TItem>,
  navigationActions: ReadonlyArray<TItem>,
  recentIds: ReadonlyArray<string>,
): ReadonlyArray<PaletteGroup<TItem>> => {
  const catalogue = [...pageActions, ...navigationActions]
  const actionsById = new Map(catalogue.map((action) => [action.id, action]))
  const applicableRecentIds = applicableRecentActionIds(recentIds, catalogue)
  const recentIdSet = new Set(applicableRecentIds)
  const recents = applicableRecentIds.flatMap((id) => {
    const action = actionsById.get(id)
    return action === undefined ? [] : [action]
  })
  const actions = pageActions.filter((action) => !recentIdSet.has(action.id))
  const navigation = navigationActions.filter((action) => !recentIdSet.has(action.id))

  const groups: ReadonlyArray<PaletteGroup<TItem>> = [
    { id: "recents", label: "Recents", items: recents },
    { id: "actions", label: "Actions", items: actions },
    { id: "navigation", label: "Navigation", items: navigation },
  ]
  return groups.filter((group) => group.items.length > 0)
}
