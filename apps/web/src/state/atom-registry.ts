import { RegistryContext } from "@effect/atom-react"
import { AtomRegistry } from "effect/unstable/reactivity"
import { createElement, type ReactNode } from "react"

export let appAtomRegistry = AtomRegistry.make()

export function AppAtomRegistryProvider({ children }: { readonly children: ReactNode }) {
  return createElement(RegistryContext.Provider, { value: appAtomRegistry }, children)
}

export function resetAppAtomRegistryForTests() {
  appAtomRegistry.dispose()
  appAtomRegistry = AtomRegistry.make()
}
