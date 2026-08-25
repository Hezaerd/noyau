import type { Writable } from "effect/unstable/reactivity/Atom"

import { appAtomRegistry } from "@/state/atom-registry"

/** Hydrate a writable atom from storage, then persist later writes. */
export const persistWritableAtom = <A>(
  atom: Writable<A>,
  options: {
    readonly read: () => A
    readonly write: (value: A) => void
  },
): void => {
  appAtomRegistry.set(atom, options.read())
  appAtomRegistry.subscribe(atom, options.write)
}
