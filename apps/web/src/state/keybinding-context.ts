import { Atom } from "effect/unstable/reactivity"

import {
  isDialogOpen,
  isEditableTarget,
  keybindingContextFromSurface,
  resolveKeybindingSurface,
  type KeybindingContext,
} from "@/lib/keybinding-when"
import { appAtomRegistry } from "@/state/atom-registry"

export const keybindingPaletteOpenAtom = Atom.make(false).pipe(
  Atom.keepAlive,
  Atom.withLabel("chrome:keybinding-palette-open"),
)

export const keybindingTicketSelectedAtom = Atom.make(false).pipe(
  Atom.keepAlive,
  Atom.withLabel("chrome:keybinding-ticket-selected"),
)

export const keybindingColumnSelectedAtom = Atom.make(false).pipe(
  Atom.keepAlive,
  Atom.withLabel("chrome:keybinding-column-selected"),
)

export const setKeybindingPaletteOpen = (open: boolean): void => {
  if (open === appAtomRegistry.get(keybindingPaletteOpenAtom)) {
    return
  }
  appAtomRegistry.set(keybindingPaletteOpenAtom, open)
}

export const setKeybindingSelection = (selection: {
  readonly ticketSelected: boolean
  readonly columnSelected: boolean
}): void => {
  if (appAtomRegistry.get(keybindingTicketSelectedAtom) !== selection.ticketSelected) {
    appAtomRegistry.set(keybindingTicketSelectedAtom, selection.ticketSelected)
  }
  if (appAtomRegistry.get(keybindingColumnSelectedAtom) !== selection.columnSelected) {
    appAtomRegistry.set(keybindingColumnSelectedAtom, selection.columnSelected)
  }
}

export const readKeybindingContext = (
  target: EventTarget | null = document.activeElement,
  pathname: string = window.location.pathname,
): KeybindingContext =>
  keybindingContextFromSurface(resolveKeybindingSurface(pathname), {
    ticketSelected: appAtomRegistry.get(keybindingTicketSelectedAtom),
    columnSelected: appAtomRegistry.get(keybindingColumnSelectedAtom),
    dialogOpen: isDialogOpen() && !appAtomRegistry.get(keybindingPaletteOpenAtom),
    commandPaletteOpen: appAtomRegistry.get(keybindingPaletteOpenAtom),
    editableFocused: isEditableTarget(target),
  })
