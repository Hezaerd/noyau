import type { ReactNode } from "react"

export type ComposerToolbarPlacement = "top" | "bottom"

export type ToolbarAreaOccupied = {
  readonly _tag: "ToolbarAreaOccupied"
  readonly placement: ComposerToolbarPlacement
  readonly requestedId: string
  readonly occupantId: string
}

export type ComposerToolbarDefinition = {
  readonly id: string
  readonly placement: ComposerToolbarPlacement
  readonly render: () => ReactNode
}

export type ComposerToolbarOpenResult =
  | {
      readonly ok: true
      readonly close: () => void
    }
  | {
      readonly ok: false
      readonly failure: ToolbarAreaOccupied
    }

export type ComposerToolbarSnapshot = Readonly<{
  readonly top: ComposerToolbarDefinition | undefined
  readonly bottom: ComposerToolbarDefinition | undefined
}>

export type ComposerToolbarStore = {
  readonly getSnapshot: () => ComposerToolbarSnapshot
  readonly subscribe: (listener: () => void) => () => void
  readonly open: (owner: symbol, definition: ComposerToolbarDefinition) => ComposerToolbarOpenResult
  readonly refresh: (owner: symbol, placement: ComposerToolbarPlacement) => void
  readonly isOwned: (owner: symbol, placement: ComposerToolbarPlacement) => boolean
}

const emptySnapshot = {
  top: undefined,
  bottom: undefined,
} satisfies ComposerToolbarSnapshot

type ActiveToolbar = ComposerToolbarDefinition & {
  readonly owner: symbol
  readonly lease: symbol
}

export const createComposerToolbarStore = (): ComposerToolbarStore => {
  const slots = new Map<ComposerToolbarPlacement, ActiveToolbar>()
  const listeners = new Set<() => void>()
  let snapshot: ComposerToolbarSnapshot = emptySnapshot

  const notify = () => {
    for (const listener of listeners) {
      listener()
    }
  }

  const replaceSnapshot = (
    placement: ComposerToolbarPlacement,
    definition: ComposerToolbarDefinition | undefined,
  ) => {
    snapshot = { ...snapshot, [placement]: definition }
    notify()
  }

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    open: (owner, definition) => {
      const current = slots.get(definition.placement)
      if (current !== undefined && current.owner !== owner) {
        return {
          ok: false,
          failure: {
            _tag: "ToolbarAreaOccupied",
            placement: definition.placement,
            requestedId: definition.id,
            occupantId: current.id,
          },
        }
      }

      const active: ActiveToolbar = {
        ...definition,
        owner,
        lease: Symbol("composer-toolbar-lease"),
      }
      slots.set(definition.placement, active)
      replaceSnapshot(definition.placement, definition)

      return {
        ok: true,
        close: () => {
          const latest = slots.get(definition.placement)
          if (latest?.owner !== owner || latest.lease !== active.lease) {
            return
          }
          slots.delete(definition.placement)
          replaceSnapshot(definition.placement, undefined)
        },
      }
    },
    refresh: (owner, placement) => {
      const current = slots.get(placement)
      if (current?.owner !== owner) {
        return
      }
      const refreshed = { ...current }
      slots.set(placement, refreshed)
      replaceSnapshot(placement, refreshed)
    },
    isOwned: (owner, placement) => slots.get(placement)?.owner === owner,
  }
}
