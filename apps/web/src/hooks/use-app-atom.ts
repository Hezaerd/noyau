import type { Atom } from "effect/unstable/reactivity"
import { useCallback, useSyncExternalStore } from "react"

import { appAtomRegistry } from "@/state/atom-registry"

/**
 * Read an Atom from the process-wide registry. The subscribe/get pair lives in
 * this module so React Compiler can see `useSyncExternalStore` instead of
 * treating `@effect/atom-react`'s `useAtomValue` as a pure function of the
 * atom identity.
 */
export const useAppAtomValue = <A>(atom: Atom.Atom<A>): A => {
  "use no memo"
  const subscribe = useCallback(
    (onChange: () => void) => appAtomRegistry.subscribe(atom, onChange),
    [atom],
  )
  const getSnapshot = useCallback(() => appAtomRegistry.get(atom), [atom])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
