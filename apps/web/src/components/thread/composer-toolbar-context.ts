import { createContext, useContext } from "react"

import type { ComposerToolbarStore } from "@/lib/composer-toolbar"

export const ComposerToolbarContext = createContext<ComposerToolbarStore | undefined>(undefined)

export const useComposerToolbarStore = () => {
  const store = useContext(ComposerToolbarContext)
  if (store === undefined) {
    throw new Error("useComposerToolbar must be used within ComposerToolbarHost.")
  }
  return store
}
