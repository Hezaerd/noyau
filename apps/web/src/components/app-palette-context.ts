import { createContext, useContext, useEffect, type ReactNode } from "react"

export interface AppPaletteAction {
  readonly id: string
  readonly label: string
  readonly searchValue: string
  readonly shortcut?: string
  readonly icon?: ReactNode
  readonly execute: () => void | Promise<void>
}

export interface AppPaletteContextValue {
  readonly registerPageActions: (actions: ReadonlyArray<AppPaletteAction>) => () => void
}

export const AppPaletteContext = createContext<AppPaletteContextValue | undefined>(undefined)

export function useAppPaletteActions(actions: ReadonlyArray<AppPaletteAction>): void {
  const context = useContext(AppPaletteContext)
  if (context === undefined) {
    throw new Error("useAppPaletteActions must be used within AppPaletteProvider.")
  }

  useEffect(() => context.registerPageActions(actions), [actions, context])
}
