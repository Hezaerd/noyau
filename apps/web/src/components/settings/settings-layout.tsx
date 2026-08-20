import { useLocation, useNavigate } from "@tanstack/react-router"
import {
  createContext,
  type ComponentPropsWithoutRef,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from "react"

import { isKeybindingRecorderActive } from "@/lib/keybindings"
import { cn } from "@/lib/utils"

interface SettingsSearchTargetContextValue {
  readonly targetId: string | null
  readonly onTargetHandled: () => void
}

const SettingsSearchTargetContext = createContext<SettingsSearchTargetContextValue>({
  targetId: null,
  onTargetHandled: () => undefined,
})

export function SettingsSearchTargetProvider({
  targetId,
  onTargetHandled,
  children,
}: {
  readonly targetId: string | null
  readonly onTargetHandled: () => void
  readonly children: ReactNode
}): ReactElement {
  const value = useMemo(() => ({ targetId, onTargetHandled }), [onTargetHandled, targetId])
  return (
    <SettingsSearchTargetContext.Provider value={value}>
      {children}
    </SettingsSearchTargetContext.Provider>
  )
}

const scrollToSettingsTarget = (target: HTMLElement): void => {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  target.scrollIntoView({
    behavior: prefersReducedMotion ? "auto" : "smooth",
    block: "center",
  })
  target.focus({ preventScroll: true })
}

function useSettingsSearchTarget(id: string | undefined) {
  const { targetId, onTargetHandled } = useContext(SettingsSearchTargetContext)
  const isSearchTarget = id !== undefined && id === targetId

  return useCallback(
    (target: HTMLElement | null) => {
      if (target && isSearchTarget) {
        scrollToSettingsTarget(target)
        onTargetHandled()
      }
    },
    [isSearchTarget, onTargetHandled],
  )
}

export function SettingsSection({
  title,
  children,
  className,
  ...sectionProps
}: ComponentPropsWithoutRef<"section"> & {
  readonly title: string
  readonly children: ReactNode
}): ReactElement {
  const targetRef = useSettingsSearchTarget(sectionProps.id)

  return (
    <section
      {...sectionProps}
      ref={targetRef}
      tabIndex={sectionProps.id === undefined ? sectionProps.tabIndex : -1}
      className={cn("flex flex-col gap-3", className)}
    >
      <h2 className="px-3 text-lg font-semibold tracking-[-0.025em] text-foreground sm:px-4">
        {title}
      </h2>
      <div className="flex flex-col">{children}</div>
    </section>
  )
}

export function SettingsRow({
  title,
  description,
  control,
  className,
  children,
  ...rowProps
}: Omit<ComponentPropsWithoutRef<"div">, "title"> & {
  readonly title: ReactNode
  readonly description?: ReactNode
  readonly control?: ReactNode
  readonly children?: ReactNode
}): ReactElement {
  const targetRef = useSettingsSearchTarget(rowProps.id)

  return (
    <div
      {...rowProps}
      ref={targetRef}
      tabIndex={rowProps.id === undefined ? rowProps.tabIndex : -1}
      className={cn("rounded-xl px-3 py-3 sm:px-4", className)}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="text-sm font-medium tracking-[-0.005em] text-foreground">{title}</h3>
          {description === undefined || description === null || description === false ? null : (
            <p className="max-w-xl text-[13px] leading-[1.45] text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {control === undefined ? null : (
          <div className="flex w-full shrink-0 items-center sm:w-auto sm:justify-end">
            {control}
          </div>
        )}
      </div>
      {children}
    </div>
  )
}

export function SettingsPage({ children }: { readonly children: ReactNode }): ReactElement {
  const navigate = useNavigate()
  const hash = useLocation({ select: (location) => location.hash })
  const targetId = hash.replace(/^#/, "") || null
  const clearTargetHash = useCallback(() => {
    void navigate({ hash: "", replace: true, resetScroll: false, hashScrollIntoView: false })
  }, [navigate])

  return (
    <SettingsSearchTargetProvider targetId={targetId} onTargetHandled={clearTargetHash}>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-10 pb-7 sm:px-8 sm:pt-12 sm:pb-10">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-12">{children}</div>
      </div>
    </SettingsSearchTargetProvider>
  )
}

export function scrollToSettingsTargetId(targetId: string): boolean {
  const target = document.getElementById(targetId)
  if (target === null) {
    return false
  }
  scrollToSettingsTarget(target)
  return true
}

export function useSettingsEscape(onEscape: () => void): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== "Escape" || isKeybindingRecorderActive()) {
        return
      }
      event.preventDefault()
      const activeElement = document.activeElement
      if (activeElement instanceof HTMLElement) {
        activeElement.blur()
      }
      onEscape()
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onEscape])
}
