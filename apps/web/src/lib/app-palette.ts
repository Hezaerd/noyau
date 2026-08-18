import { Option, Schema } from "effect"

export const MAX_PALETTE_RECENTS = 5

export interface PaletteItem {
  readonly id: string
}

export interface PaletteGroup<TItem extends PaletteItem> {
  readonly id: "recents" | "actions" | "navigation"
  readonly label: "Récents" | "Actions" | "Navigation"
  readonly items: ReadonlyArray<TItem>
}

const RecentActionIdsJson = Schema.fromJsonString(Schema.Array(Schema.String))
const decodeRecentActionIds = Schema.decodeUnknownOption(RecentActionIdsJson)
const encodeRecentActionIds = Schema.encodeSync(RecentActionIdsJson)

export const parseRecentActionIds = (value: string | null): ReadonlyArray<string> =>
  Option.getOrElse(decodeRecentActionIds(value ?? "[]"), () => [])

export const serializeRecentActionIds = (ids: ReadonlyArray<string>): string =>
  encodeRecentActionIds([...ids])

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
    { id: "recents", label: "Récents", items: recents },
    { id: "actions", label: "Actions", items: actions },
    { id: "navigation", label: "Navigation", items: navigation },
  ]
  return groups.filter((group) => group.items.length > 0)
}
