import { useAtomValue } from "@effect/atom-react"
import type { ProjectId, ThreadId } from "@noyau/contracts/ids"
import { PlusIcon, XIcon } from "lucide-react"
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
} from "react"

import { Button } from "@/components/ui/button"
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuPopup,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@/components/ui/menu"
import {
  workspaceTabCatalog,
  workspaceTabKeepMountedKinds,
} from "@/components/workspace-panel/catalog"
import type { WorkspaceTabRegistration } from "@/components/workspace-panel/define-workspace-tab"
import { terminalClose } from "@/lib/control-plane"
import { cn } from "@/lib/utils"
import {
  EMPTY_TAB_ID_SET,
  reconcileKeepMountedTabIds,
  resolveActiveWorkspaceTab,
} from "@/lib/workspace-panel"
import { MIN_WORKSPACE_PANEL_WIDTH } from "@/lib/workspace-panel-persist"
import {
  activateWorkspaceTab,
  closeAllWorkspaceTabs,
  closeOtherWorkspaceTabs,
  closeWorkspaceTab,
  closeWorkspaceTabsToRight,
  openWorkspaceTab,
  setWorkspacePanelWidth,
  workspacePanelAtom,
  workspacePanelWidthAtom,
} from "@/state/workspace-panel"

const openKind = (threadId: ThreadId, kind: WorkspaceTabRegistration): void => {
  if (kind.available !== undefined && !kind.available()) {
    return
  }
  openWorkspaceTab(threadId, kind)
}

export function WorkspacePanel({
  threadId,
  projectId,
  kinds = workspaceTabCatalog,
}: {
  readonly threadId: ThreadId
  readonly projectId?: ProjectId
  readonly kinds?: ReadonlyArray<WorkspaceTabRegistration>
}): ReactElement | null {
  const state = useAtomValue(workspacePanelAtom(threadId))
  const width = useAtomValue(workspacePanelWidthAtom)
  const activeTab = resolveActiveWorkspaceTab(state)
  const keepMountedKinds = useMemo(
    () =>
      kinds === workspaceTabCatalog
        ? workspaceTabKeepMountedKinds
        : new Set(kinds.flatMap((kind) => (kind.keepMounted === true ? [kind.kind] : []))),
    [kinds],
  )
  const [committedTabIds, setCommittedTabIds] = useState<ReadonlySet<string>>(EMPTY_TAB_ID_SET)
  const renderedTabIds = reconcileKeepMountedTabIds({
    previous: committedTabIds,
    tabs: state.tabs,
    activeTabId: activeTab?.id ?? null,
    keepMountedKinds,
  })

  const previousTerminalIds = useRef<ReadonlySet<string>>(EMPTY_TAB_ID_SET)

  useLayoutEffect(() => {
    const nextIds = new Set(
      state.tabs.flatMap((tab) => {
        const terminalId = tab.kind === "terminal" ? tab.payload.terminalId : undefined
        return typeof terminalId === "string" ? [terminalId] : []
      }),
    )
    if (projectId !== undefined) {
      for (const terminalId of previousTerminalIds.current) {
        if (!nextIds.has(terminalId)) {
          void terminalClose({ projectId, threadId, terminalId })
        }
      }
    }
    previousTerminalIds.current = nextIds
  }, [projectId, state.tabs, threadId])

  useLayoutEffect(() => {
    setCommittedTabIds((current) => {
      const next = reconcileKeepMountedTabIds({
        previous: current,
        tabs: state.tabs,
        activeTabId: activeTab?.id ?? null,
        keepMountedKinds,
      })
      if (next.size === current.size && [...next].every((tabId) => current.has(tabId))) {
        return current
      }
      return next
    })
  }, [activeTab?.id, keepMountedKinds, state.tabs])

  if (!state.open) {
    return null
  }

  const availableKinds = kinds.filter(
    (kind) => kind.launchable !== false && (kind.available === undefined || kind.available()),
  )
  const kindByName = new Map(kinds.map((kind) => [kind.kind, kind]))
  const renderedTabs = state.tabs.filter(
    (tab) => tab.id === activeTab?.id || renderedTabIds.has(tab.id),
  )

  return (
    <aside
      className="relative flex h-full min-h-0 shrink-0 flex-col border-s border-border/70 bg-background"
      data-slot="workspace-panel"
      style={{ width }}
    >
      <WorkspacePanelResizeHandle width={width} />
      <header className="flex h-10 shrink-0 items-center gap-1 border-b border-border/70 px-1.5">
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="flex min-w-max items-center gap-0.5" role="tablist">
            {state.tabs.map((tab) => {
              const kind = kindByName.get(tab.kind)
              const label = kind?.titleOf?.(tab) ?? kind?.label ?? tab.kind
              const Icon = kind?.icon
              return (
                <WorkspacePanelTab
                  key={tab.id}
                  active={tab.id === activeTab?.id}
                  label={label}
                  icon={Icon === undefined ? null : <Icon />}
                  onActivate={() => activateWorkspaceTab(threadId, tab.id)}
                  onClose={() => closeWorkspaceTab(threadId, tab.id)}
                  onCloseOthers={() => closeOtherWorkspaceTabs(threadId, tab.id)}
                  onCloseToRight={() => closeWorkspaceTabsToRight(threadId, tab.id)}
                  onCloseAll={() => closeAllWorkspaceTabs(threadId)}
                />
              )
            })}
          </div>
        </div>
        {availableKinds.length > 0 ? (
          <Menu>
            <MenuTrigger
              render={
                <Button
                  aria-label="Add workspace tab"
                  className="text-muted-foreground"
                  size="icon-xs"
                  variant="ghost"
                />
              }
            >
              <PlusIcon />
            </MenuTrigger>
            <MenuPopup align="end" side="bottom">
              {availableKinds.map((kind) => {
                const Icon = kind.icon
                return (
                  <MenuItem key={kind.kind} onClick={() => openKind(threadId, kind)}>
                    <Icon />
                    {kind.label}
                  </MenuItem>
                )
              })}
            </MenuPopup>
          </Menu>
        ) : null}
      </header>
      <div className="relative min-h-0 flex-1">
        {activeTab === null ? (
          <WorkspacePanelLauncher
            kinds={availableKinds}
            onOpen={(kind) => openKind(threadId, kind)}
          />
        ) : null}
        {renderedTabs.map((tab) => {
          const kind = kindByName.get(tab.kind)
          if (kind === undefined) {
            return null
          }
          const isActive = tab.id === activeTab?.id
          const isVisible = isActive && state.open
          return (
            <div
              key={tab.id}
              className={cn(
                "absolute inset-0 min-h-0",
                isVisible ? "z-1" : "invisible pointer-events-none",
              )}
              data-slot="workspace-tab-surface"
              data-tab-id={tab.id}
              data-tab-kind={tab.kind}
            >
              {kind.render({ tab, threadId, projectId, isActive, isVisible })}
            </div>
          )
        })}
      </div>
    </aside>
  )
}

function WorkspacePanelTab({
  active,
  label,
  icon,
  onActivate,
  onClose,
  onCloseOthers,
  onCloseToRight,
  onCloseAll,
}: {
  readonly active: boolean
  readonly label: string
  readonly icon: ReactNode
  readonly onActivate: () => void
  readonly onClose: () => void
  readonly onCloseOthers: () => void
  readonly onCloseToRight: () => void
  readonly onCloseAll: () => void
}): ReactElement {
  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <div
            className={cn(
              "group flex h-7 max-w-48 items-center gap-1 rounded-md px-1.5 text-xs",
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
            data-active={active ? "" : undefined}
            data-slot="workspace-panel-tab"
          />
        }
      >
        <button
          type="button"
          role="tab"
          aria-label={label}
          aria-selected={active}
          className="flex min-w-0 flex-1 items-center gap-1 text-start"
          onClick={onActivate}
        >
          <span aria-hidden="true">{icon}</span>
          <span className="truncate">{label}</span>
        </button>
        <button
          type="button"
          aria-label={`Close ${label}`}
          className="rounded-sm p-0.5 text-muted-foreground opacity-0 hover:bg-background/80 hover:text-foreground group-hover:opacity-100 group-data-active:opacity-100"
          onClick={(event) => {
            event.stopPropagation()
            onClose()
          }}
        >
          <XIcon className="size-3" />
        </button>
      </ContextMenuTrigger>
      <ContextMenuPopup align="start" side="bottom">
        <ContextMenuItem onClick={onClose}>Close</ContextMenuItem>
        <ContextMenuItem onClick={onCloseOthers}>Close others</ContextMenuItem>
        <ContextMenuItem onClick={onCloseToRight}>Close to the right</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onCloseAll}>Close all</ContextMenuItem>
      </ContextMenuPopup>
    </ContextMenu>
  )
}

function WorkspacePanelLauncher({
  kinds,
  onOpen,
}: {
  readonly kinds: ReadonlyArray<WorkspaceTabRegistration>
  readonly onOpen: (kind: WorkspaceTabRegistration) => void
}): ReactElement {
  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-3 p-6"
      data-slot="workspace-panel-launcher"
    >
      {kinds.length === 0 ? null : (
        <div className="grid w-full max-w-72 grid-cols-2 gap-2">
          {kinds.map((kind) => {
            const Icon = kind.icon
            return (
              <button
                key={kind.kind}
                type="button"
                aria-label={kind.label}
                className="flex flex-col items-start gap-2 rounded-lg border border-border/70 p-3 text-start hover:bg-accent/50"
                onClick={() => onOpen(kind)}
              >
                <span aria-hidden="true">
                  <Icon />
                </span>
                <span className="text-sm font-medium">{kind.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function WorkspacePanelResizeHandle({ width }: { readonly width: number }): ReactElement {
  const dragRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null)

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: width }
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (drag === null || drag.pointerId !== event.pointerId) {
      return
    }
    const nextWidth = Math.max(
      MIN_WORKSPACE_PANEL_WIDTH,
      drag.startWidth + (drag.startX - event.clientX),
    )
    setWorkspacePanelWidth(nextWidth)
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null
    }
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize workspace panel"
      className="absolute inset-y-0 -start-1 z-10 w-2 cursor-col-resize"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    />
  )
}
