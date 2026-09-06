import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import type { TicketActivity } from "@noyau/contracts/board"
import type { ClientCommandRequest } from "@noyau/contracts/commands"
import type { TicketPriority } from "@noyau/contracts/entities/ticket"
import { KanbanColumnId, type ProjectId, type ThreadId, TicketId } from "@noyau/contracts/ids"
import { differenceInCalendarDays, format, parseISO, startOfToday } from "date-fns"
import { enUS } from "date-fns/locale"
import type { Crypto } from "effect"
import { type Effect } from "effect"
import {
  ArchiveIcon,
  CalendarIcon,
  CircleIcon,
  EllipsisIcon,
  FunnelIcon,
  GripVerticalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type RefObject,
} from "react"

import { type AppPaletteAction, useAppPaletteActions } from "@/components/app-palette-context"
import { TicketArchiveConfirmDialog } from "@/components/board/TicketArchiveConfirmDialog"
import { TicketDialog } from "@/components/board/TicketDialog"
import { ResourceErrorState, ScopeBanner } from "@/components/failure/FailureSurfaces"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuPopup,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { Input } from "@/components/ui/input"
import { KeyboardShortcut } from "@/components/ui/keyboard-shortcut"
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu"
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useProjectThreads } from "@/hooks/use-control-plane"
import { useDelayedSubscriptionFailure } from "@/hooks/use-delayed-subscription-failure"
import { useKeybindingHandlers } from "@/hooks/use-keybinding-handler"
import { useKeybindings } from "@/hooks/use-keybindings"
import { useProjectBoard } from "@/hooks/use-project-board"
import {
  createBoardActions,
  groupBoardActions,
  type ExecutableBoardAction,
} from "@/lib/board-actions"
import {
  applyTicketDrop,
  isFiltered,
  isTicketPriority,
  moveTicket,
  moveTicketToAdjacentColumn,
  openDependencyCountByTicketId,
  openDependencyTitles,
  priorities,
  reorderTicket,
  ticketDependencyIssue,
  ticketsInColumn,
  updateTicket,
  visibleTickets,
  type BoardColumn,
  type BoardFilters,
  type BoardSearch,
  type BoardSearchPatch,
  type BoardState,
  type BoardTicket,
} from "@/lib/board-model"
import { refreshBoard as fetchBoardSnapshot, runBoardCommand } from "@/lib/board-page-actions"
import { boardStateFromSnapshot } from "@/lib/board-snapshot"
import { presentFailure, type FailurePresentation } from "@/lib/failure-presentation"
import { showFailureToast } from "@/lib/failure-toast"
import {
  makeKanbanColumnCreateRequest,
  makeKanbanColumnDeleteRequest,
  makeKanbanColumnUpdateRequest,
  makeTicketArchiveRequest,
  makeTicketCreateRequest,
  makeTicketDependencyAddRequest,
  makeTicketDependencyRemoveRequest,
  makeTicketThreadLinkRequest,
  makeTicketThreadUnlinkRequest,
  makeTicketMoveRequest,
  makeTicketUpdateRequest,
} from "@/lib/ticket-commands"
import { cn } from "@/lib/utils"
import { setKeybindingSelection } from "@/state/keybinding-context"
const priorityLabels = {
  none: "No priority",
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
} satisfies Record<TicketPriority, string>

const priorityStyles = {
  none: "text-muted-foreground",
  low: "text-info",
  normal: "text-primary",
  high: "text-warning",
  urgent: "text-destructive",
} satisfies Record<TicketPriority, string>

interface BoardPageProps {
  readonly projectId: ProjectId
  readonly search: BoardSearch
  readonly onSearchChange: (patch: BoardSearchPatch, replace?: boolean) => void
  readonly onOpenTicket: (ticketId: string) => void
  readonly onCloseTicket: () => void
  readonly onOpenThread: (threadId: ThreadId) => void
}

type TicketUpdateInput = {
  readonly ticketId: TicketId
  readonly title?: string
  readonly description?: string | null
  readonly priority?: TicketPriority
  readonly dueAt?: string | null
}

interface TicketCardProps {
  readonly ticket: BoardTicket
  readonly state: BoardState
  readonly openDependencyCounts: ReadonlyMap<string, number>
  readonly actions: ReadonlyArray<ExecutableBoardAction>
  readonly active: boolean
  readonly overlay?: boolean
  readonly onOpen: () => void
  readonly onFocus: () => void
}

function BoardActionIcon({ action }: { readonly action: ExecutableBoardAction }) {
  switch (action.appearance.kind) {
    case "create":
      return <PlusIcon />
    case "search":
      return <SearchIcon />
    case "ticket":
      return <CircleIcon className={priorityStyles[action.appearance.priority]} />
    case "rename":
      return <PencilIcon />
    case "archive":
      return <ArchiveIcon />
    case "delete":
      return <Trash2Icon />
  }
}

const renderBoardActionContextMenuItem = (action: ExecutableBoardAction) => (
  <ContextMenuItem
    key={action.id}
    closeOnClick
    disabled={action.disabled}
    variant={action.destructive ? "destructive" : "default"}
    onClick={() => requestAnimationFrame(() => void action.execute())}
  >
    <BoardActionIcon action={action} />
    {action.label}
    {action.shortcut === undefined ? null : <ContextMenuShortcut hotkey={action.shortcut} />}
  </ContextMenuItem>
)

function BoardActionContextMenuItems({
  actions,
}: {
  readonly actions: ReadonlyArray<ExecutableBoardAction>
}) {
  const regular = actions.filter((action) => !action.destructive)
  const destructive = actions.filter((action) => action.destructive)

  return (
    <>
      {regular.map(renderBoardActionContextMenuItem)}
      {regular.length === 0 || destructive.length === 0 ? null : <ContextMenuSeparator />}
      {destructive.map(renderBoardActionContextMenuItem)}
    </>
  )
}

const dueLabel = (
  ticket: BoardTicket,
  done: boolean,
): { label: string; late: boolean } | undefined => {
  if (ticket.dueAt === undefined) {
    return undefined
  }
  const due = parseISO(ticket.dueAt)
  const days = differenceInCalendarDays(due, startOfToday())
  const date = format(due, "d MMM", { locale: enUS })
  if (!done && days < 0) {
    return { label: `${date} · Overdue`, late: true }
  }
  if (!done && days <= 3) {
    return { label: `${date} · Soon`, late: false }
  }
  return { label: date, late: false }
}

function TicketCard({
  ticket,
  state,
  openDependencyCounts,
  actions,
  active,
  overlay = false,
  onOpen,
  onFocus,
}: TicketCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: ticket.id,
    disabled: overlay,
  })
  const column = state.columns.find((candidate) => candidate.id === ticket.columnId)
  const due = dueLabel(ticket, column?.done ?? false)
  const openDependencyCount = openDependencyCounts.get(ticket.id) ?? 0
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }
  const contextActions = groupBoardActions(actions, "context-menu", {
    kind: "ticket",
    id: ticket.id,
  }).flatMap((group) => group.actions)

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <article
            ref={setNodeRef}
            style={style}
            data-ticket-id={ticket.id}
            className={cn(
              "group relative rounded-xl border border-border/85 bg-card shadow-xs",
              "hover:border-border hover:shadow-lg/5",
              active && "border-primary/55 ring-2 ring-primary/18",
              isDragging && "opacity-30",
              overlay && "w-72 rotate-1 border-primary/50 shadow-2xl",
            )}
          />
        }
      >
        <button
          type="button"
          onClick={onOpen}
          onFocus={onFocus}
          className="w-full touch-none rounded-xl px-3.5 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/65"
          aria-label={`Open ticket ${ticket.title}`}
          {...attributes}
          {...listeners}
        >
          <div className="flex items-start gap-2">
            <CircleIcon
              className={cn("mt-0.5 size-3.5 shrink-0", priorityStyles[ticket.priority])}
            />
            <h3 className="line-clamp-2 flex-1 text-[0.82rem] leading-snug font-medium tracking-[-0.01em]">
              {ticket.title}
            </h3>
            <span
              className="mt-0.5 cursor-grab touch-none text-muted-foreground/35 opacity-0 group-hover:opacity-100"
              aria-hidden="true"
            >
              <GripVerticalIcon className="size-3.5" />
            </span>
          </div>

          {openDependencyCount === 0 && due === undefined ? null : (
            <div className="mt-3 flex items-center gap-2 border-t border-border/55 pt-2.5">
              {openDependencyCount === 0 ? null : (
                <Badge variant="outline" className="h-5 rounded-full px-1.5 text-[0.6rem]">
                  Blocked
                </Badge>
              )}
              {due === undefined ? null : (
                <span
                  className={cn(
                    "flex items-center gap-1 text-[0.6rem] text-muted-foreground",
                    due.late && "text-destructive",
                  )}
                >
                  <CalendarIcon className="size-3" />
                  {due.label}
                </span>
              )}
            </div>
          )}
        </button>
      </ContextMenuTrigger>
      <ContextMenuPopup align="start" className="w-48">
        <BoardActionContextMenuItems actions={contextActions} />
      </ContextMenuPopup>
    </ContextMenu>
  )
}

interface QuickCreateProps {
  readonly columnId: string
  readonly active: boolean
  readonly onCancel: () => void
  readonly onCreate: (title: string) => void
  readonly onActivate: () => void
}

function QuickCreate({ columnId, active, onCancel, onCreate, onActivate }: QuickCreateProps) {
  const [title, setTitle] = useState("")
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (title.trim() === "") {
      return
    }
    onCreate(title)
    setTitle("")
  }

  if (!active) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start text-muted-foreground"
        onClick={onActivate}
      >
        <PlusIcon />
        Add a ticket
      </Button>
    )
  }

  return (
    <form onSubmit={submit} className="rounded-xl border bg-card p-2 shadow-sm">
      <Input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Ticket title"
        aria-label={`Title of the new ticket in ${columnId}`}
        autoFocus
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onCancel()
          }
        }}
        className="border-transparent bg-transparent shadow-none"
      />
      <div className="mt-2 flex items-center gap-2">
        <Button type="submit" size="xs" disabled={title.trim() === ""}>
          Add
        </Button>
        <Button type="button" variant="ghost" size="icon-xs" onClick={onCancel} aria-label="Cancel">
          <XIcon />
        </Button>
      </div>
    </form>
  )
}

interface BoardColumnViewProps {
  readonly column: BoardColumn
  readonly state: BoardState
  readonly openDependencyCounts: ReadonlyMap<string, number>
  readonly actions: ReadonlyArray<ExecutableBoardAction>
  readonly filters: BoardFilters
  readonly activeTicketId: string | undefined
  readonly selected: boolean
  readonly creating: boolean
  readonly editing: boolean
  readonly onActiveTicket: (ticketId: string) => void
  readonly onSelectColumn: () => void
  readonly onOpenTicket: (ticketId: string) => void
  readonly onCreate: (title: string) => void
  readonly onCreatingChange: (creating: boolean) => void
  readonly onEditingChange: (editing: boolean) => void
  readonly onRename: (name: string) => void
  readonly onColor: (color: string) => void
  readonly onDelete: () => void
}

function BoardColumnView({
  column,
  state,
  openDependencyCounts,
  actions,
  filters,
  activeTicketId,
  selected,
  creating,
  editing,
  onActiveTicket,
  onSelectColumn,
  onOpenTicket,
  onCreate,
  onCreatingChange,
  onEditingChange,
  onRename,
  onColor,
  onDelete,
}: BoardColumnViewProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${column.id}` })
  const allTickets = ticketsInColumn(state, column.id)
  const tickets = visibleTickets(state, column.id, filters)
  const filtered = isFiltered(filters)
  const [name, setName] = useState(column.name)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const contextActions = groupBoardActions(actions, "context-menu", {
    kind: "column",
    id: column.id,
  }).flatMap((group) => group.actions)

  useEffect(() => {
    if (!editing) {
      return
    }
    const frame = requestAnimationFrame(() => {
      nameInputRef.current?.focus()
      nameInputRef.current?.select()
    })
    return () => cancelAnimationFrame(frame)
  }, [editing])

  return (
    <section
      ref={setNodeRef}
      aria-labelledby={`column-title-${column.id}`}
      className={cn(
        "flex h-full w-[304px] shrink-0 flex-col rounded-2xl border border-border/70 bg-card",
        selected && "border-primary/55 ring-2 ring-primary/25",
        isOver && "border-primary/45 bg-primary/5",
      )}
    >
      <ContextMenu>
        <ContextMenuTrigger
          render={
            <header
              className="flex h-12 items-center gap-2 border-b border-border/55 px-3"
              onPointerDown={() => {
                onSelectColumn()
              }}
            />
          }
        >
          <span className="size-2 rounded-full" style={{ backgroundColor: column.color }} />
          {editing ? (
            <Input
              ref={nameInputRef}
              size="sm"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onBlur={() => {
                if (name.trim() !== "") {
                  onRename(name)
                }
                onEditingChange(false)
              }}
              onContextMenu={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur()
                }
                if (event.key === "Escape") {
                  setName(column.name)
                  onEditingChange(false)
                }
              }}
              className="min-w-0 flex-1 border-transparent bg-transparent px-1 text-xs font-semibold"
            />
          ) : (
            <h2
              id={`column-title-${column.id}`}
              className="min-w-0 flex-1 truncate text-xs font-semibold"
            >
              {column.name}
            </h2>
          )}
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[0.58rem] text-muted-foreground">
            {filtered ? `${tickets.length}/${allTickets.length}` : allTickets.length}
          </span>
          <Menu>
            <MenuTrigger
              render={
                <Button variant="ghost" size="icon-xs" aria-label={`Column menu ${column.name}`}>
                  <EllipsisIcon />
                </Button>
              }
            />
            <MenuPopup align="end" className="w-44">
              <MenuGroup>
                <MenuGroupLabel>{column.name}</MenuGroupLabel>
                <MenuItem onClick={() => onEditingChange(true)}>Rename</MenuItem>
              </MenuGroup>
              <MenuSeparator />
              <MenuGroup>
                <MenuGroupLabel>Color</MenuGroupLabel>
                {[
                  ["Neutral", "#a3a3a3"],
                  ["Blue", "#3B82F6"],
                  ["Emerald", "#10B981"],
                  ["Amber", "#F59E0B"],
                ].map(([label, color]) => (
                  <MenuItem key={color} onClick={() => onColor(color ?? "#a3a3a3")}>
                    <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
                    {label}
                  </MenuItem>
                ))}
              </MenuGroup>
              {column.done ? null : (
                <>
                  <MenuSeparator />
                  <MenuItem variant="destructive" onClick={onDelete}>
                    Delete
                  </MenuItem>
                </>
              )}
            </MenuPopup>
          </Menu>
        </ContextMenuTrigger>
        <ContextMenuPopup align="start" className="w-48">
          <BoardActionContextMenuItems actions={contextActions} />
        </ContextMenuPopup>
      </ContextMenu>

      <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
        <SortableContext
          items={tickets.map((ticket) => ticket.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2.5">
            {tickets.map((ticket) => (
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                state={state}
                openDependencyCounts={openDependencyCounts}
                actions={actions}
                active={activeTicketId === ticket.id}
                onFocus={() => onActiveTicket(ticket.id)}
                onOpen={() => onOpenTicket(ticket.id)}
              />
            ))}
          </div>
        </SortableContext>

        {tickets.length === 0 && filtered ? (
          <div className="grid min-h-28 place-items-center px-4 text-center text-xs text-muted-foreground">
            No tickets visible in this column.
          </div>
        ) : null}

        {column.done ? null : (
          <div className="mt-2.5">
            <QuickCreate
              columnId={column.id}
              active={creating}
              onActivate={() => onCreatingChange(true)}
              onCancel={() => onCreatingChange(false)}
              onCreate={onCreate}
            />
          </div>
        )}
      </div>
    </section>
  )
}

const COLUMN_DROPPABLE_PREFIX = "column:"

const isBelowOverItem = (
  active: DragEndEvent["active"],
  over: NonNullable<DragEndEvent["over"]>,
): boolean => {
  const translated = active.rect.current.translated
  if (translated === null) {
    return false
  }
  return translated.top + translated.height / 2 > over.rect.top + over.rect.height / 2
}

const parseOverTarget = (
  board: BoardState,
  overId: string,
): { readonly columnId: string; readonly overTicketId?: string } | undefined => {
  if (overId.startsWith(COLUMN_DROPPABLE_PREFIX)) {
    return { columnId: overId.slice(COLUMN_DROPPABLE_PREFIX.length) }
  }
  const overTicket = board.tickets.find((ticket) => ticket.id === overId)
  if (overTicket === undefined) {
    return undefined
  }
  return { columnId: overTicket.columnId, overTicketId: overTicket.id }
}

const focusTicket = (boardRef: RefObject<HTMLElement | null>, ticketId: string | undefined) => {
  if (ticketId === undefined) {
    return
  }
  const element = boardRef.current?.querySelector<HTMLElement>(
    `[data-ticket-id="${ticketId}"] button`,
  )
  element?.focus()
}

export function BoardPage({
  projectId,
  search,
  onSearchChange,
  onOpenTicket,
  onCloseTicket,
  onOpenThread,
}: BoardPageProps) {
  const projectThreads = useProjectThreads(projectId)
  const { resolved: keybindings } = useKeybindings()
  const { snapshot: boardSnapshot, status: subscriptionStatus } = useProjectBoard(projectId)
  const [state, setState] = useState<BoardState>({
    columns: [],
    tickets: [],
    ticketDependencies: [],
    ticketThreads: [],
  })
  const [boardFailure, setBoardFailure] = useState<FailurePresentation>()
  const [loading, setLoading] = useState(true)
  const [ticketActivityError, setTicketActivityError] = useState<string>()
  const [ticketActivityByTicket, setTicketActivityByTicket] = useState<
    ReadonlyArray<TicketActivity>
  >([])
  const [activeTicketId, setActiveTicketId] = useState<string | undefined>(state.tickets[0]?.id)
  const [activeColumnId, setActiveColumnId] = useState<string>()
  const [draggedTicketId, setDraggedTicketId] = useState<string>()
  const [creatingColumnId, setCreatingColumnId] = useState<string>()
  const [editingColumnId, setEditingColumnId] = useState<string>()
  const [renamingTicketId, setRenamingTicketId] = useState<string>()
  const [ticketToArchive, setTicketToArchive] = useState<BoardTicket>()
  const [addingColumn, setAddingColumn] = useState(false)
  const [newColumnName, setNewColumnName] = useState("")
  const [announcement, setAnnouncement] = useState(
    "Board loaded. Use the arrow keys to move between tickets.",
  )
  const boardRef = useRef<HTMLElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const dragStartStateRef = useRef<BoardState | undefined>(undefined)
  const hasBoardDataRef = useRef(false)
  const subscriptionFailure = useDelayedSubscriptionFailure(subscriptionStatus)
  const filters: BoardFilters = {
    query: search.q ?? "",
    ...(search.priority !== undefined && { priority: search.priority }),
  }
  const filtered = isFiltered(filters)
  const selectedTicket = state.tickets.find((ticket) => ticket.id === search.ticket)
  const selectedTicketId = selectedTicket?.id
  const ticketActivity = useMemo(
    () =>
      ticketActivityByTicket.find((activity) => activity.ticketId === selectedTicketId)?.events ??
      [],
    [ticketActivityByTicket, selectedTicketId],
  )
  const draggedTicket = state.tickets.find((ticket) => ticket.id === draggedTicketId)
  const selectedColumnId =
    activeColumnId !== undefined && state.columns.some((column) => column.id === activeColumnId)
      ? activeColumnId
      : undefined
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const priorityOptions = [
    { value: "all", label: "All priorities" },
    ...priorities
      .filter((priority) => priority !== "none")
      .map((priority) => ({ value: priority, label: priorityLabels[priority] })),
  ]

  const applyBoardSnapshot = useCallback(
    (snapshot: Awaited<ReturnType<typeof fetchBoardSnapshot>>) => {
      if (!snapshot.ok) {
        setBoardFailure(
          presentFailure(snapshot.failure, {
            operation: "project.subscribe",
            scope: "resource",
            initiatedByUser: false,
            hasUsableData: hasBoardDataRef.current,
          }),
        )
        setLoading(false)
        return undefined
      }
      hasBoardDataRef.current = snapshot.value.columns.length > 0
      setState(boardStateFromSnapshot(snapshot.value))
      setTicketActivityByTicket(snapshot.value.ticketActivity)
      setBoardFailure(undefined)
      setLoading(false)
      return undefined
    },
    [],
  )

  const refreshBoard = useCallback(() => {
    void fetchBoardSnapshot(projectId).then(applyBoardSnapshot)
  }, [applyBoardSnapshot, projectId])

  useEffect(() => {
    if (selectedTicketId === undefined) {
      setTicketActivityError(undefined)
      return
    }
    setTicketActivityError(undefined)
  }, [selectedTicketId])

  useEffect(() => {
    setLoading(true)
    setTicketActivityByTicket([])
  }, [projectId])

  useEffect(() => {
    if (boardSnapshot === undefined) {
      return
    }
    hasBoardDataRef.current = boardSnapshot.columns.length > 0
    setState(boardStateFromSnapshot(boardSnapshot))
    setTicketActivityByTicket(boardSnapshot.ticketActivity)
    setLoading(false)
    setBoardFailure(undefined)
  }, [boardSnapshot])

  useEffect(() => {
    if (subscriptionStatus?._tag === "Reconnecting") {
      setLoading(false)
    }
  }, [subscriptionStatus])

  const visibleByColumn = new Map(
    state.columns.map((column) => [column.id, visibleTickets(state, column.id, filters)]),
  )
  const {
    columns: boardColumns,
    tickets: boardTickets,
    ticketDependencies: boardTicketDependencies,
  } = state
  const openDependencyCounts = useMemo(
    () =>
      openDependencyCountByTicketId({
        columns: boardColumns,
        tickets: boardTickets,
        ticketDependencies: boardTicketDependencies,
      }),
    [boardColumns, boardTickets, boardTicketDependencies],
  )

  const selectTicket = (ticketId: string | undefined) => {
    setActiveColumnId(undefined)
    setActiveTicketId(ticketId)
  }

  const selectColumn = (columnId: string) => {
    setActiveTicketId(undefined)
    setActiveColumnId(columnId)
  }

  const setActiveAndFocus = (ticketId: string | undefined) => {
    selectTicket(ticketId)
    requestAnimationFrame(() => focusTicket(boardRef, ticketId))
  }

  const runCommand = <A extends ClientCommandRequest, E>(
    request: Effect.Effect<A, E, Crypto.Crypto>,
    successMessage: string,
  ) => {
    void runBoardCommand(projectId, request).then(({ result, snapshot }) => {
      if (!result.ok) {
        const presentation = presentFailure(result.failure, {
          operation: "ticket.command",
          scope: "project",
          initiatedByUser: true,
          hasUsableData: true,
        })
        if (presentation.surface === "toast") showFailureToast(presentation)
        else setBoardFailure(presentation)
        setAnnouncement("The command could not be sent to the control plane.")
      } else {
        setAnnouncement(successMessage)
      }
      applyBoardSnapshot(snapshot)
      return undefined
    })
  }

  const persistTicketPlacement = (next: BoardState, ticketId: string, message: string) => {
    const ticket = next.tickets.find((candidate) => candidate.id === ticketId)
    if (ticket === undefined) {
      return
    }
    const siblings = ticketsInColumn(next, ticket.columnId)
    const index = siblings.findIndex((candidate) => candidate.id === ticketId)
    const beforeTicket = siblings[index + 1]
    const afterTicket = siblings[index - 1]
    const placement =
      beforeTicket === undefined
        ? afterTicket === undefined
          ? { columnId: KanbanColumnId.make(ticket.columnId) }
          : {
              columnId: KanbanColumnId.make(ticket.columnId),
              afterTicketId: TicketId.make(afterTicket.id),
            }
        : afterTicket === undefined
          ? {
              columnId: KanbanColumnId.make(ticket.columnId),
              beforeTicketId: TicketId.make(beforeTicket.id),
            }
          : {
              columnId: KanbanColumnId.make(ticket.columnId),
              beforeTicketId: TicketId.make(beforeTicket.id),
              afterTicketId: TicketId.make(afterTicket.id),
            }
    runCommand(
      makeTicketMoveRequest({
        ticketId: TicketId.make(ticketId),
        placement,
      }),
      message,
    )
  }

  const navigateVertical = (direction: -1 | 1) => {
    const active = state.tickets.find((ticket) => ticket.id === activeTicketId)
    if (active === undefined) {
      const columnTickets =
        activeColumnId === undefined ? undefined : (visibleByColumn.get(activeColumnId) ?? [])
      setActiveAndFocus(
        columnTickets?.[0]?.id ??
          state.columns.flatMap((column) => visibleByColumn.get(column.id) ?? [])[0]?.id,
      )
      return
    }
    const tickets = visibleByColumn.get(active.columnId) ?? []
    const index = tickets.findIndex((ticket) => ticket.id === active.id)
    setActiveAndFocus(tickets[Math.min(Math.max(index + direction, 0), tickets.length - 1)]?.id)
  }

  const navigateHorizontal = (direction: -1 | 1) => {
    const active = state.tickets.find((ticket) => ticket.id === activeTicketId)
    const sourceColumnId = active?.columnId ?? activeColumnId
    if (sourceColumnId === undefined) {
      return
    }
    const sourceIndex = state.columns.findIndex((column) => column.id === sourceColumnId)
    const destination = state.columns[sourceIndex + direction]
    if (destination === undefined) {
      return
    }
    const sourceTickets = visibleByColumn.get(sourceColumnId) ?? []
    const destinationTickets = visibleByColumn.get(destination.id) ?? []
    const sourceTicketIndex =
      active === undefined ? 0 : sourceTickets.findIndex((ticket) => ticket.id === active.id)
    const nextTicket =
      destinationTickets[Math.min(Math.max(sourceTicketIndex, 0), destinationTickets.length - 1)]
    if (nextTicket === undefined) {
      selectColumn(destination.id)
      return
    }
    setActiveAndFocus(nextTicket.id)
  }

  const keyboardMove = (direction: -1 | 1, acrossColumns: boolean) => {
    if (activeTicketId === undefined) {
      return
    }
    const ticket = state.tickets.find((candidate) => candidate.id === activeTicketId)
    if (ticket === undefined) {
      return
    }
    if (acrossColumns) {
      const next = moveTicketToAdjacentColumn(state, activeTicketId, direction)
      const destination = next.tickets.find((candidate) => candidate.id === activeTicketId)
      if (next !== state && destination !== undefined) {
        setState(next)
        const column = next.columns.find((candidate) => candidate.id === destination.columnId)
        persistTicketPlacement(
          next,
          activeTicketId,
          `Ticket moved to ${column?.name ?? "the target column"}${filtered ? ", at the end of the column" : ""}.`,
        )
      }
      return
    }
    if (filtered) {
      setAnnouncement("Reordering is disabled in a filtered view.")
      return
    }
    const next = reorderTicket(state, activeTicketId, direction)
    setState(next)
    const nextPosition = next.tickets.find((candidate) => candidate.id === activeTicketId)?.position
    persistTicketPlacement(
      next,
      activeTicketId,
      `Ticket reordered, position ${(nextPosition ?? 0) + 1}.`,
    )
  }

  useEffect(() => {
    if (activeColumnId !== undefined && selectedColumnId === undefined) {
      setActiveColumnId(undefined)
    }
    if (
      editingColumnId !== undefined &&
      !state.columns.some((column) => column.id === editingColumnId)
    ) {
      setEditingColumnId(undefined)
    }
  }, [activeColumnId, editingColumnId, selectedColumnId, state.columns])

  useEffect(() => {
    setKeybindingSelection({
      ticketSelected: activeTicketId !== undefined,
      columnSelected: selectedColumnId !== undefined && activeTicketId === undefined,
    })
    return () => setKeybindingSelection({ ticketSelected: false, columnSelected: false })
  }, [activeTicketId, selectedColumnId])

  useKeybindingHandlers({
    "board.navigate.up": () => navigateVertical(-1),
    "board.navigate.down": () => navigateVertical(1),
    "board.navigate.left": () => navigateHorizontal(-1),
    "board.navigate.right": () => navigateHorizontal(1),
    "board.ticket.open": () => {
      if (activeTicketId !== undefined) {
        onOpenTicket(activeTicketId)
      }
    },
    "board.ticket.create": () => {
      const active = state.tickets.find((ticket) => ticket.id === activeTicketId)
      const fallback = state.columns.find((column) => !column.done)
      const columnId = active?.columnId ?? fallback?.id
      const column = state.columns.find((candidate) => candidate.id === columnId)
      if (column !== undefined && !column.done) {
        setCreatingColumnId(column.id)
      }
    },
    "board.ticket.rename": () => {
      if (activeTicketId !== undefined) {
        setRenamingTicketId(activeTicketId)
        onOpenTicket(activeTicketId)
      }
    },
    "board.column.rename": () => {
      if (selectedColumnId !== undefined && activeTicketId === undefined) {
        setEditingColumnId(selectedColumnId)
      }
    },
    "board.search": () => searchRef.current?.focus(),
    "board.move.up": () => keyboardMove(-1, false),
    "board.move.down": () => keyboardMove(1, false),
    "board.move.left": () => keyboardMove(-1, true),
    "board.move.right": () => keyboardMove(1, true),
  })

  const handleDragStart = ({ active }: DragStartEvent) => {
    dragStartStateRef.current = state
    setDraggedTicketId(String(active.id))
  }

  const handleDragOver = ({ active, over }: DragOverEvent) => {
    if (over === null || filtered) {
      return
    }

    const ticketId = String(active.id)
    const overId = String(over.id)
    if (ticketId === overId) {
      return
    }

    setState((current) => {
      const source = current.tickets.find((ticket) => ticket.id === ticketId)
      const target = parseOverTarget(current, overId)
      if (source === undefined || target === undefined || target.columnId === source.columnId) {
        return current
      }

      return applyTicketDrop(
        current,
        ticketId,
        target.columnId,
        target.overTicketId,
        isBelowOverItem(active, over),
      )
    })
  }

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const origin = dragStartStateRef.current ?? state
    setDraggedTicketId(undefined)
    dragStartStateRef.current = undefined
    if (over === null) {
      setState(origin)
      return
    }
    const ticketId = String(active.id)
    const source = origin.tickets.find((ticket) => ticket.id === ticketId)
    if (source === undefined) {
      setState(origin)
      return
    }
    if (String(over.id) === ticketId) {
      setState(state)
      selectTicket(ticketId)
      if (state !== origin) {
        const preview = state.tickets.find((ticket) => ticket.id === ticketId)
        const column = state.columns.find((candidate) => candidate.id === preview?.columnId)
        persistTicketPlacement(
          state,
          ticketId,
          `Ticket moved to ${column?.name ?? "the target column"}, position ${(preview?.position ?? 0) + 1}.`,
        )
      }
      return
    }
    const target = parseOverTarget(origin, String(over.id))
    if (target === undefined) {
      setState(origin)
      return
    }
    if (filtered && target.columnId === source.columnId) {
      setState(origin)
      setAnnouncement("Reordering is disabled in a filtered view.")
      return
    }
    const next = filtered
      ? moveTicket(origin, ticketId, target.columnId)
      : applyTicketDrop(
          origin,
          ticketId,
          target.columnId,
          target.overTicketId,
          isBelowOverItem(active, over),
        )
    setState(next)
    selectTicket(ticketId)
    if (next === origin) {
      return
    }
    const column = next.columns.find((candidate) => candidate.id === target.columnId)
    const moved = next.tickets.find((ticket) => ticket.id === ticketId)
    persistTicketPlacement(
      next,
      ticketId,
      filtered
        ? `Ticket moved to ${column?.name ?? "the target column"}, at the end of the column.`
        : `Ticket moved to ${column?.name ?? "the target column"}, position ${(moved?.position ?? 0) + 1}.`,
    )
  }

  const clearFilters = () => onSearchChange({ q: undefined, priority: undefined }, true)

  const createInColumn = (columnId: string, title: string) => {
    setCreatingColumnId(undefined)
    runCommand(
      makeTicketCreateRequest({
        projectId,
        title: title.trim(),
        placement: { columnId: KanbanColumnId.make(columnId) },
      }),
      `Ticket ${title} created in the column.`,
    )
  }

  const archiveTicket = (ticket: BoardTicket) => {
    const blockedBy = openDependencyTitles(state, ticket.id)
    if (search.ticket === ticket.id) {
      onCloseTicket()
    }
    const ticketId = TicketId.make(ticket.id)
    runCommand(
      makeTicketArchiveRequest(
        blockedBy.length > 0 ? { ticketId, acknowledgeOpenDependencies: true } : { ticketId },
      ),
      `Ticket ${ticket.title} archived.`,
    )
  }

  const removeColumn = (column: BoardColumn) => {
    if (column.done) {
      return
    }
    const destination = state.columns.find(
      (candidate) => !candidate.done && candidate.id !== column.id,
    )
    if (destination === undefined) {
      setAnnouncement("Keep at least one non-terminal column.")
      return
    }
    let next = state
    for (const ticket of ticketsInColumn(state, column.id)) {
      next = moveTicket(next, ticket.id, destination.id)
    }
    if (activeColumnId === column.id) {
      setActiveColumnId(undefined)
    }
    if (editingColumnId === column.id) {
      setEditingColumnId(undefined)
    }
    setState({ ...next, columns: next.columns.filter((candidate) => candidate.id !== column.id) })
    runCommand(
      makeKanbanColumnDeleteRequest({
        columnId: KanbanColumnId.make(column.id),
        destinationColumnId: KanbanColumnId.make(destination.id),
      }),
      `Column deleted. Its tickets were moved to ${destination.name}.`,
    )
  }

  const createTicketFromPalette = useCallback(() => {
    const column = state.columns.find((candidate) => !candidate.done)
    setCreatingColumnId(column?.id)
  }, [state.columns])
  const focusBoardSearch = useCallback(
    () => requestAnimationFrame(() => searchRef.current?.focus()),
    [],
  )
  const paletteActions = useMemo<ReadonlyArray<AppPaletteAction>>(
    () => [
      {
        id: "ticket.create",
        label: "Create a ticket",
        searchValue: "Create a ticket",
        icon: <PlusIcon />,
        execute: createTicketFromPalette,
      },
      {
        id: "board.search",
        label: "Search",
        searchValue: "Search the Board",
        icon: <SearchIcon />,
        execute: focusBoardSearch,
      },
      ...state.tickets.map((ticket): AppPaletteAction => ({
        id: `ticket.open.${ticket.id}`,
        label: ticket.title,
        searchValue: `${ticket.title} ${ticket.description}`,
        category: "ticket",
        icon: <CircleIcon className={priorityStyles[ticket.priority]} />,
        execute: () => onOpenTicket(ticket.id),
      })),
    ],
    [createTicketFromPalette, focusBoardSearch, onOpenTicket, state.tickets],
  )
  useAppPaletteActions(paletteActions)

  const boardActions = createBoardActions(
    state,
    {
      createTicket: createTicketFromPalette,
      focusSearch: focusBoardSearch,
      deleteColumn: (columnId) => {
        const column = state.columns.find((candidate) => candidate.id === columnId)
        if (column !== undefined) {
          removeColumn(column)
        }
      },
      openTicket: onOpenTicket,
      renameColumn: setEditingColumnId,
      renameTicket: (ticketId) => {
        setRenamingTicketId(ticketId)
        onOpenTicket(ticketId)
      },
      archiveTicket: (ticketId) => {
        const ticket = state.tickets.find((candidate) => candidate.id === ticketId)
        if (ticket !== undefined) {
          setTicketToArchive(ticket)
        }
      },
    },
    keybindings,
  )
  const streamPresentation =
    subscriptionFailure === undefined
      ? undefined
      : presentFailure(subscriptionFailure, {
          operation: "project.subscribe",
          scope: "project",
          initiatedByUser: false,
          hasUsableData: state.columns.length > 0,
        })
  const persistentFailure = streamPresentation ?? boardFailure

  if (
    !loading &&
    state.columns.length === 0 &&
    persistentFailure !== undefined &&
    persistentFailure.surface === "page"
  ) {
    return <ResourceErrorState presentation={persistentFailure} onRecovery={refreshBoard} />
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {persistentFailure === undefined || persistentFailure.surface === "toast" ? null : (
        <ScopeBanner presentation={persistentFailure} onRecovery={refreshBoard} />
      )}
      <header className="border-b border-border/65 bg-background/80 px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 id="board-title" className="text-2xl font-semibold tracking-[-0.04em]">
                Board
              </h1>
              <Badge variant="outline" className="rounded-full text-[0.6rem]">
                {loading
                  ? "Loading…"
                  : `${state.tickets.length} ${state.tickets.length === 1 ? "ticket" : "tickets"}`}
              </Badge>
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 xl:justify-end">
            <div className="relative min-w-56 flex-1 xl:max-w-sm">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchRef}
                value={search.q ?? ""}
                onChange={(event) =>
                  onSearchChange(
                    { q: event.target.value === "" ? undefined : event.target.value },
                    true,
                  )
                }
                placeholder="Search a ticket…"
                className="pl-9"
              />
              <KeyboardShortcut
                hotkey={keybindings["board.search"]}
                className="absolute top-1/2 right-2 -translate-y-1/2 text-[0.58rem]"
              />
            </div>

            <Select
              items={priorityOptions}
              value={search.priority ?? "all"}
              onValueChange={(value) => {
                if (value === "all") {
                  onSearchChange({ priority: undefined }, true)
                } else if (value !== null && isTicketPriority(value)) {
                  onSearchChange({ priority: value }, true)
                }
              }}
            >
              <SelectTrigger size="default" className="w-auto">
                <FunnelIcon />
                <SelectValue>
                  {search.priority === undefined ? "Priority" : priorityLabels[search.priority]}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {priorityOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>

            {filtered ? (
              <Button variant="ghost" size="default" onClick={clearFilters}>
                <XIcon />
                Clear
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => {
          setDraggedTicketId(undefined)
          const dragStartState = dragStartStateRef.current
          dragStartStateRef.current = undefined
          if (dragStartState !== undefined) {
            setState(dragStartState)
          }
        }}
      >
        <section
          ref={boardRef}
          aria-labelledby="board-title"
          tabIndex={-1}
          className="min-h-0 flex-1 overflow-x-auto p-4 outline-none sm:p-6"
        >
          <div className="flex h-full min-h-[520px] w-max items-stretch gap-3.5">
            {state.columns.map((column) => (
              <BoardColumnView
                key={column.id}
                column={column}
                state={state}
                openDependencyCounts={openDependencyCounts}
                actions={boardActions}
                filters={filters}
                activeTicketId={activeTicketId}
                selected={selectedColumnId === column.id && activeTicketId === undefined}
                creating={creatingColumnId === column.id}
                editing={editingColumnId === column.id}
                onActiveTicket={selectTicket}
                onSelectColumn={() => {
                  selectColumn(column.id)
                }}
                onOpenTicket={onOpenTicket}
                onCreate={(title) => createInColumn(column.id, title)}
                onCreatingChange={(creating) =>
                  setCreatingColumnId(creating ? column.id : undefined)
                }
                onEditingChange={(editing) => setEditingColumnId(editing ? column.id : undefined)}
                onRename={(name) => {
                  setState((current) => ({
                    ...current,
                    columns: current.columns.map((candidate) =>
                      candidate.id === column.id ? { ...candidate, name: name.trim() } : candidate,
                    ),
                  }))
                  runCommand(
                    makeKanbanColumnUpdateRequest({
                      columnId: KanbanColumnId.make(column.id),
                      name: name.trim(),
                    }),
                    `Column renamed ${name.trim()}.`,
                  )
                }}
                onColor={(color) => {
                  setState((current) => ({
                    ...current,
                    columns: current.columns.map((candidate) =>
                      candidate.id === column.id ? { ...candidate, color } : candidate,
                    ),
                  }))
                  runCommand(
                    makeKanbanColumnUpdateRequest({
                      columnId: KanbanColumnId.make(column.id),
                      color,
                    }),
                    `Column ${column.name} color updated.`,
                  )
                }}
                onDelete={() => removeColumn(column)}
              />
            ))}

            <div className="w-[288px] shrink-0">
              {addingColumn ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault()
                    if (newColumnName.trim() === "") {
                      return
                    }
                    const done = state.columns.find((column) => column.done)
                    const columnInput =
                      done === undefined
                        ? { name: newColumnName.trim(), color: "#A855F7" }
                        : {
                            name: newColumnName.trim(),
                            color: "#A855F7",
                            beforeColumnId: KanbanColumnId.make(done.id),
                          }
                    runCommand(
                      makeKanbanColumnCreateRequest({ ...columnInput, projectId }),
                      `Column ${newColumnName.trim()} added.`,
                    )
                    setNewColumnName("")
                    setAddingColumn(false)
                  }}
                  className="rounded-2xl border bg-card p-3"
                >
                  <Input
                    value={newColumnName}
                    onChange={(event) => setNewColumnName(event.target.value)}
                    placeholder="Column name"
                    autoFocus
                  />
                  <div className="mt-2 flex gap-2">
                    <Button type="submit" size="xs" disabled={newColumnName.trim() === ""}>
                      Add
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => setAddingColumn(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <Button
                  variant="outline"
                  className="w-full justify-start border-dashed bg-card/35 text-muted-foreground"
                  onClick={() => setAddingColumn(true)}
                >
                  <PlusIcon />
                  Add a column
                </Button>
              )}
            </div>
          </div>
        </section>

        <DragOverlay>
          {draggedTicket === undefined ? null : (
            <TicketCard
              ticket={draggedTicket}
              state={state}
              openDependencyCounts={openDependencyCounts}
              actions={boardActions}
              active={false}
              overlay
              onFocus={() => undefined}
              onOpen={() => undefined}
            />
          )}
        </DragOverlay>
      </DndContext>

      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      <TicketDialog
        ticket={selectedTicket}
        tickets={state.tickets}
        columns={state.columns}
        ticketDependencies={state.ticketDependencies}
        ticketThreads={state.ticketThreads}
        threads={projectThreads}
        activity={ticketActivity}
        activityLoading={false}
        {...(ticketActivityError === undefined ? {} : { activityError: ticketActivityError })}
        focusTitle={renamingTicketId === selectedTicket?.id}
        onClose={() => {
          const ticketId = selectedTicket?.id
          setRenamingTicketId(undefined)
          onCloseTicket()
          requestAnimationFrame(() => {
            const visible =
              ticketId === undefined
                ? undefined
                : state.tickets.find((ticket) => ticket.id === ticketId)
            if (
              visible !== undefined &&
              visibleTickets(state, visible.columnId, filters).some(
                (ticket) => ticket.id === visible.id,
              )
            ) {
              setActiveAndFocus(visible.id)
              return
            }
            const fallback =
              visible === undefined
                ? undefined
                : visibleTickets(state, visible.columnId, filters)[0]
            setActiveAndFocus(fallback?.id)
          })
        }}
        onTitleFocusComplete={() => setRenamingTicketId(undefined)}
        onUpdate={(ticketId, patch) => {
          setState((current) => updateTicket(current, ticketId, patch))
          const hasDetails =
            patch.title !== undefined ||
            patch.description !== undefined ||
            patch.priority !== undefined ||
            "dueAt" in patch
          if (hasDetails) {
            let updateInput: TicketUpdateInput = { ticketId: TicketId.make(ticketId) }
            if (patch.title !== undefined) {
              updateInput = { ...updateInput, title: patch.title }
            }
            if (patch.description !== undefined) {
              updateInput = { ...updateInput, description: patch.description }
            }
            if (patch.priority !== undefined) {
              updateInput = { ...updateInput, priority: patch.priority }
            }
            if ("dueAt" in patch) {
              updateInput = {
                ...updateInput,
                dueAt: patch.dueAt === undefined ? null : patch.dueAt,
              }
            }
            runCommand(makeTicketUpdateRequest(updateInput), "Ticket details updated.")
          }
        }}
        onAddDependency={(ticketId, dependsOnTicketId) => {
          if (ticketDependencyIssue(state, ticketId, dependsOnTicketId) !== undefined) {
            setAnnouncement("This dependency would create a duplicate or a cycle.")
            return
          }
          runCommand(
            makeTicketDependencyAddRequest({
              ticketId: TicketId.make(ticketId),
              dependsOnTicketId: TicketId.make(dependsOnTicketId),
            }),
            "Dependency added.",
          )
        }}
        onRemoveDependency={(ticketId, dependsOnTicketId) => {
          runCommand(
            makeTicketDependencyRemoveRequest({
              ticketId: TicketId.make(ticketId),
              dependsOnTicketId: TicketId.make(dependsOnTicketId),
            }),
            "Dependency removed.",
          )
        }}
        onLinkThread={(ticketId, threadId) => {
          runCommand(
            makeTicketThreadLinkRequest({
              ticketId: TicketId.make(ticketId),
              threadId,
            }),
            "Thread linked to the ticket.",
          )
        }}
        onUnlinkThread={(ticketId, threadId) => {
          runCommand(
            makeTicketThreadUnlinkRequest({
              ticketId: TicketId.make(ticketId),
              threadId,
            }),
            "Thread unlinked from the ticket.",
          )
        }}
        onOpenThread={onOpenThread}
        archiveBlockedByTitles={
          selectedTicket === undefined ? [] : openDependencyTitles(state, selectedTicket.id)
        }
        onArchive={(ticketId) => {
          const ticket = state.tickets.find((candidate) => candidate.id === ticketId)
          if (ticket !== undefined) {
            archiveTicket(ticket)
          }
        }}
      />
      <TicketArchiveConfirmDialog
        open={ticketToArchive !== undefined}
        ticketTitle={ticketToArchive?.title ?? ""}
        blockedByTitles={
          ticketToArchive === undefined ? [] : openDependencyTitles(state, ticketToArchive.id)
        }
        onOpenChange={(open) => {
          if (!open) {
            setTicketToArchive(undefined)
          }
        }}
        onConfirm={() => {
          if (ticketToArchive !== undefined) {
            archiveTicket(ticketToArchive)
            setTicketToArchive(undefined)
          }
        }}
      />
    </main>
  )
}
