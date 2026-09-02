import { useState, useSyncExternalStore, type ReactNode } from "react"

import { ComposerToolbarContext } from "@/components/thread/composer-toolbar-context"
import { useComposerToolbar } from "@/components/thread/use-composer-toolbar"
import {
  createComposerToolbarStore,
  type ComposerToolbarDefinition,
  type ComposerToolbarPlacement,
  type ToolbarAreaOccupied,
} from "@/lib/composer-toolbar"

function ComposerToolbarArea({
  placement,
  toolbar,
}: {
  readonly placement: ComposerToolbarPlacement
  readonly toolbar: ComposerToolbarDefinition | undefined
}) {
  return toolbar === undefined ? null : (
    <div data-slot="composer-toolbar-area" data-placement={placement}>
      {toolbar.render()}
    </div>
  )
}

export type ComposerToolbarOwnerDefinition = {
  /** Stable identity for this owner while its toolbar lifecycle is active. */
  readonly id: string
  readonly placement: ComposerToolbarPlacement
  readonly content: ReactNode
  readonly active?: boolean | undefined
  /** Blocking owners preempt transient normal owners in the same area. */
  readonly priority?: "normal" | "blocking" | undefined
  /** Called when this definition cannot claim its requested placement. It does not auto-retry. */
  readonly onOpenFailure?: ((failure: ToolbarAreaOccupied) => void) | undefined
}

const EMPTY_TOOLBAR_OWNERS: ReadonlyArray<ComposerToolbarOwnerDefinition> = []

function ComposerToolbarOwner({
  definition,
}: {
  readonly definition: ComposerToolbarOwnerDefinition
}) {
  useComposerToolbar({
    id: definition.id,
    placement: definition.placement,
    content: definition.content,
    active: definition.active ?? true,
    onOpenFailure: definition.onOpenFailure,
  })
  return null
}

const ownerKeyOf = (definition: ComposerToolbarOwnerDefinition, occurrence: number): string =>
  JSON.stringify([definition.placement, definition.id, occurrence])

export function ComposerToolbarHost({
  children,
  toolbars = EMPTY_TOOLBAR_OWNERS,
}: {
  readonly children: ReactNode
  readonly toolbars?: ReadonlyArray<ComposerToolbarOwnerDefinition> | undefined
}) {
  const [store] = useState(createComposerToolbarStore)
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const hasActiveBlockingTop = toolbars.some(
    (definition) =>
      definition.placement === "top" &&
      definition.priority === "blocking" &&
      definition.active !== false,
  )
  const visibleToolbars = hasActiveBlockingTop
    ? toolbars.filter(
        (definition) => definition.placement !== "top" || definition.priority === "blocking",
      )
    : toolbars
  const occurrences = new Map<string, number>()
  const owners = visibleToolbars.map((definition) => {
    const identity = JSON.stringify([definition.placement, definition.id])
    const occurrence = occurrences.get(identity) ?? 0
    occurrences.set(identity, occurrence + 1)
    return { definition, key: ownerKeyOf(definition, occurrence) }
  })

  return (
    <ComposerToolbarContext.Provider value={store}>
      {owners.map(({ definition, key }) => (
        <ComposerToolbarOwner key={key} definition={definition} />
      ))}
      <div
        data-slot="composer-toolbar-host"
        data-bottom-toolbar-open={snapshot.bottom === undefined ? "false" : "true"}
      >
        <ComposerToolbarArea placement="top" toolbar={snapshot.top} />
        {children}
        <ComposerToolbarArea placement="bottom" toolbar={snapshot.bottom} />
      </div>
    </ComposerToolbarContext.Provider>
  )
}
