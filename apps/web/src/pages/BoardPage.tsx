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
import type { EventCursor } from "@noyau/protocol/board"
import type { TicketPriority } from "@noyau/protocol/entities/ticket"
import {
  ActorId,
  AgentProfileId,
  KanbanColumnId,
  type ProjectId,
  TicketId,
} from "@noyau/protocol/ids"
import type { TicketCommandRequest } from "@noyau/protocol/ticket/commands"
import {
  Calendar,
  CheckCircle,
  Command as CommandIcon,
  DotsSixVertical,
  DotsThree,
  DotOutline,
  Funnel,
  MagnifyingGlass,
  Plus,
  Robot,
  User,
  WarningCircle,
  X,
} from "@phosphor-icons/react"
import { useHotkeys } from "@tanstack/react-hotkeys"
import { differenceInCalendarDays, format, parseISO, startOfToday } from "date-fns"
import { fr } from "date-fns/locale"
import type { Crypto } from "effect"
import { type Effect } from "effect"
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type RefObject,
} from "react"

import { TicketSheet } from "@/components/board/TicketSheet"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  appendWorkbenchMessage,
  boardActors,
  isFiltered,
  isTicketPriority,
  moveTicket,
  moveTicketToAdjacentColumn,
  priorities,
  reorderTicket,
  startExecution,
  ticketsInColumn,
  toggleChecklistItem,
  updateTicket,
  visibleTickets,
  type BoardColumn,
  type BoardFilters,
  type BoardSearch,
  type BoardSearchPatch,
  type BoardState,
  type BoardTicket,
} from "@/lib/board-model"
import { boardStateFromSnapshot, withExecutionSummaries } from "@/lib/board-snapshot"
import {
  buildAndSubmitTicketCommand,
  loadBoardSnapshot,
  loadProjectExecutions,
  subscribeProjectEvents,
} from "@/lib/control-plane"
import {
  makeExecutionStartRequest,
  makeKanbanColumnCreateRequest,
  makeKanbanColumnDeleteRequest,
  makeKanbanColumnUpdateRequest,
  makeTicketAssignRequest,
  makeTicketCreateRequest,
  makeTicketMoveRequest,
  makeTicketUpdateRequest,
} from "@/lib/ticket-commands"
import { cn } from "@/lib/utils"

const priorityLabels: Record<TicketPriority, string> = {
  none: "Sans priorité",
  low: "Basse",
  normal: "Normale",
  high: "Haute",
  urgent: "Urgente",
}

const priorityStyles: Record<TicketPriority, string> = {
  none: "text-zinc-500",
  low: "text-sky-400",
  normal: "text-violet-400",
  high: "text-amber-400",
  urgent: "text-rose-400",
}

const attentionLabels = {
  blocked: "Bloqué",
  question: "Question",
  approval: "Approbation",
  failure: "Échec",
} as const

const attentionStyles = {
  blocked: "border-amber-500/20 bg-amber-500/10 text-amber-300",
  question: "border-sky-500/20 bg-sky-500/10 text-sky-300",
  approval: "border-violet-500/20 bg-violet-500/10 text-violet-300",
  failure: "border-rose-500/20 bg-rose-500/10 text-rose-300",
} as const

const executionLabels = {
  running: "En cours",
  waiting: "Attend une réponse",
  verifying: "Vérification",
  failed: "Échec",
} as const

interface BoardPageProps {
  readonly projectId: ProjectId
  readonly search: BoardSearch
  readonly onSearchChange: (patch: BoardSearchPatch, replace?: boolean) => void
  readonly onOpenTicket: (ticketId: string) => void
  readonly onCloseTicket: () => void
}

interface TicketCardProps {
  readonly ticket: BoardTicket
  readonly state: BoardState
  readonly active: boolean
  readonly overlay?: boolean
  readonly onOpen: () => void
  readonly onFocus: () => void
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
  const date = format(due, "d MMM", { locale: fr })
  if (!done && days < 0) {
    return { label: `${date} · En retard`, late: true }
  }
  if (!done && days <= 3) {
    return { label: `${date} · Bientôt`, late: false }
  }
  return { label: date, late: false }
}

function TicketCard({ ticket, state, active, overlay = false, onOpen, onFocus }: TicketCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: ticket.id,
    disabled: overlay,
  })
  const actor = state.actors.find((candidate) => candidate.id === ticket.assigneeId)
  const column = state.columns.find((candidate) => candidate.id === ticket.columnId)
  const due = dueLabel(ticket, column?.done ?? false)
  const checklistDone = ticket.checklist.filter((item) => item.done).length
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <article
      ref={setNodeRef}
      style={style}
      data-ticket-id={ticket.id}
      className={cn(
        "group relative rounded-xl border border-border/85 bg-card shadow-[0_5px_18px_rgba(0,0,0,0.18)]",
        "hover:border-border hover:shadow-[0_10px_30px_rgba(34,28,74,0.28)]",
        active && "border-primary/55 ring-2 ring-primary/18",
        isDragging && "opacity-30",
        overlay && "w-72 rotate-1 border-primary/50 shadow-2xl",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        onFocus={onFocus}
        className="w-full touch-none rounded-xl px-3.5 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/65"
        aria-label={`Ouvrir le ticket ${ticket.title}`}
        {...attributes}
        {...listeners}
      >
        <div className="flex items-start gap-2">
          <DotOutline className={cn("mt-0.5 size-3.5 shrink-0", priorityStyles[ticket.priority])} />
          <h3 className="line-clamp-2 flex-1 text-[0.82rem] leading-snug font-medium tracking-[-0.01em]">
            {ticket.title}
          </h3>
          <span
            className="mt-0.5 cursor-grab touch-none text-muted-foreground/35 opacity-0 group-hover:opacity-100"
            aria-hidden="true"
          >
            <DotsSixVertical className="size-3.5" />
          </span>
        </div>

        {ticket.attention === undefined ? null : (
          <Badge
            variant="outline"
            className={cn(
              "mt-3 rounded-md px-1.5 text-[0.58rem]",
              attentionStyles[ticket.attention],
            )}
          >
            <WarningCircle />
            {attentionLabels[ticket.attention]}
          </Badge>
        )}

        {ticket.execution === undefined ? null : (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-muted/55 px-2.5 py-2">
            <Robot className="size-3.5 shrink-0 text-violet-400" />
            <p className="min-w-0 flex-1 truncate text-[0.65rem] text-muted-foreground">
              {ticket.execution.count} exécution{ticket.execution.count > 1 ? "s" : ""} ·{" "}
              <span className="text-foreground">{executionLabels[ticket.execution.status]}</span>
            </p>
          </div>
        )}

        {ticket.labels.length === 0 ? null : (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {ticket.labels.slice(0, 3).map((label) => (
              <span
                key={label}
                className="rounded-md bg-secondary px-1.5 py-0.5 text-[0.58rem] text-muted-foreground"
              >
                {label}
              </span>
            ))}
          </div>
        )}

        <div className="mt-3 flex items-center gap-2 border-t border-border/55 pt-2.5">
          {actor === undefined ? (
            <span className="grid size-5 place-items-center rounded-md border border-dashed text-muted-foreground/50">
              <User className="size-2.5" />
            </span>
          ) : (
            <Avatar className="size-5 rounded-md">
              <AvatarFallback className="rounded-md bg-primary/12 text-[0.5rem] font-semibold text-primary">
                {actor.initials}
              </AvatarFallback>
            </Avatar>
          )}
          {due === undefined ? null : (
            <span
              className={cn(
                "flex items-center gap-1 text-[0.6rem] text-muted-foreground",
                due.late && "text-rose-300",
              )}
            >
              <Calendar className="size-3" />
              {due.label}
            </span>
          )}
          {ticket.checklist.length === 0 ? null : (
            <span className="ml-auto flex items-center gap-1 text-[0.6rem] text-muted-foreground">
              <CheckCircle className="size-3" />
              {checklistDone}/{ticket.checklist.length}
            </span>
          )}
        </div>
      </button>
    </article>
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
        <Plus />
        Ajouter un ticket
      </Button>
    )
  }

  return (
    <form onSubmit={submit} className="rounded-xl border bg-card p-2 shadow-sm">
      <Input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Titre du ticket"
        aria-label={`Titre du nouveau ticket dans ${columnId}`}
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
          Ajouter
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onCancel}
          aria-label="Annuler"
        >
          <X />
        </Button>
      </div>
    </form>
  )
}

interface BoardColumnViewProps {
  readonly column: BoardColumn
  readonly state: BoardState
  readonly filters: BoardFilters
  readonly activeTicketId: string | undefined
  readonly creating: boolean
  readonly editing: boolean
  readonly onActiveTicket: (ticketId: string) => void
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
  filters,
  activeTicketId,
  creating,
  editing,
  onActiveTicket,
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

  return (
    <section
      ref={setNodeRef}
      aria-labelledby={`column-title-${column.id}`}
      className={cn(
        "flex h-full w-[304px] shrink-0 flex-col rounded-2xl border border-border/70 bg-[#121218]/88",
        isOver && "border-primary/45 bg-primary/5",
      )}
    >
      <header className="flex h-12 items-center gap-2 border-b border-border/55 px-3">
        <span className="size-2 rounded-full" style={{ backgroundColor: column.color }} />
        {editing ? (
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => {
              if (name.trim() !== "") {
                onRename(name)
              }
              onEditingChange(false)
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur()
              }
              if (event.key === "Escape") {
                setName(column.name)
                onEditingChange(false)
              }
            }}
            className="h-7 flex-1 border-transparent bg-transparent px-1 text-xs font-semibold"
            autoFocus
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
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Menu de la colonne ${column.name}`}
              >
                <DotsThree />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuGroup>
              <DropdownMenuLabel>{column.name}</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => onEditingChange(true)}>Renommer</DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Couleur</DropdownMenuLabel>
              {[
                ["Violet", "#6D5BD0"],
                ["Bleu", "#3B82F6"],
                ["Émeraude", "#10B981"],
                ["Ambre", "#F59E0B"],
              ].map(([label, color]) => (
                <DropdownMenuItem key={color} onClick={() => onColor(color ?? "#6D5BD0")}>
                  <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            {column.done ? null : (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={onDelete}>
                  Supprimer
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

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
                active={activeTicketId === ticket.id}
                onFocus={() => onActiveTicket(ticket.id)}
                onOpen={() => onOpenTicket(ticket.id)}
              />
            ))}
          </div>
        </SortableContext>

        {tickets.length === 0 && filtered ? (
          <div className="grid min-h-28 place-items-center px-4 text-center text-xs text-muted-foreground">
            Aucun ticket visible dans cette colonne.
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
}: BoardPageProps) {
  const [state, setState] = useState<BoardState>({
    actors: boardActors,
    columns: [],
    tickets: [],
  })
  const [cursor, setCursor] = useState<EventCursor>()
  const [controlPlaneError, setControlPlaneError] = useState<string>()
  const [loading, setLoading] = useState(true)
  const [activeTicketId, setActiveTicketId] = useState<string | undefined>(state.tickets[0]?.id)
  const [draggedTicketId, setDraggedTicketId] = useState<string>()
  const [creatingColumnId, setCreatingColumnId] = useState<string>()
  const [editingColumnId, setEditingColumnId] = useState<string>()
  const [addingColumn, setAddingColumn] = useState(false)
  const [newColumnName, setNewColumnName] = useState("")
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [announcement, setAnnouncement] = useState(
    "Tableau chargé. Utilise les flèches pour naviguer entre les tickets.",
  )
  const boardRef = useRef<HTMLElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const dragStartStateRef = useRef<BoardState | undefined>(undefined)
  const filters: BoardFilters = {
    query: search.q ?? "",
    ...(search.assignee === undefined ? {} : { assignee: search.assignee }),
    ...(search.priority === undefined ? {} : { priority: search.priority }),
  }
  const filtered = isFiltered(filters)
  const selectedTicket = state.tickets.find((ticket) => ticket.id === search.ticket)
  const draggedTicket = state.tickets.find((ticket) => ticket.id === draggedTicketId)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const refreshBoard = useCallback(async () => {
    const [snapshot, executions] = await Promise.all([
      loadBoardSnapshot(projectId),
      loadProjectExecutions(projectId),
    ])
    if (!snapshot.ok) {
      setControlPlaneError(snapshot.details)
      setLoading(false)
      return false
    }
    if (!executions.ok) {
      setControlPlaneError(executions.details)
      setLoading(false)
      return false
    }
    setState((current) =>
      withExecutionSummaries(boardStateFromSnapshot(snapshot.value, current), executions.value),
    )
    setCursor((current) => current ?? snapshot.value.cursor)
    setControlPlaneError(undefined)
    setLoading(false)
    return true
  }, [projectId])

  useEffect(() => {
    void refreshBoard()
  }, [refreshBoard])

  useEffect(() => {
    if (cursor === undefined) {
      return
    }
    return subscribeProjectEvents(
      projectId,
      cursor,
      () => {
        void refreshBoard()
      },
      setControlPlaneError,
    )
  }, [cursor, projectId, refreshBoard])

  const visibleByColumn = new Map(
    state.columns.map((column) => [column.id, visibleTickets(state, column.id, filters)]),
  )

  const setActiveAndFocus = (ticketId: string | undefined) => {
    setActiveTicketId(ticketId)
    requestAnimationFrame(() => focusTicket(boardRef, ticketId))
  }

  const runCommand = async <A extends TicketCommandRequest, E>(
    request: Effect.Effect<A, E, Crypto.Crypto>,
    successMessage: string,
  ) => {
    const result = await buildAndSubmitTicketCommand(projectId, request)
    if (!result.ok) {
      setControlPlaneError(result.details)
      setAnnouncement("La commande n’a pas pu être envoyée au control plane.")
      await refreshBoard()
      return false
    }
    if (result.value.response._tag === "rejected") {
      const reason = result.value.response.error._tag
      setControlPlaneError(reason)
      setAnnouncement(`Commande rejetée : ${reason}.`)
      await refreshBoard()
      return false
    }
    setControlPlaneError(undefined)
    setAnnouncement(successMessage)
    await refreshBoard()
    return true
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
    void runCommand(
      makeTicketMoveRequest({
        ticketId: TicketId.make(ticketId),
        placement: {
          columnId: KanbanColumnId.make(ticket.columnId),
          ...(beforeTicket === undefined ? {} : { beforeTicketId: TicketId.make(beforeTicket.id) }),
          ...(afterTicket === undefined ? {} : { afterTicketId: TicketId.make(afterTicket.id) }),
        },
      }),
      message,
    )
  }

  const navigateVertical = (direction: -1 | 1) => {
    const active = state.tickets.find((ticket) => ticket.id === activeTicketId)
    if (active === undefined) {
      setActiveAndFocus(
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
    if (active === undefined) {
      return
    }
    const sourceIndex = state.columns.findIndex((column) => column.id === active.columnId)
    const destination = state.columns[sourceIndex + direction]
    if (destination === undefined) {
      return
    }
    const sourceTickets = visibleByColumn.get(active.columnId) ?? []
    const destinationTickets = visibleByColumn.get(destination.id) ?? []
    const sourceTicketIndex = sourceTickets.findIndex((ticket) => ticket.id === active.id)
    setActiveAndFocus(
      destinationTickets[Math.min(sourceTicketIndex, destinationTickets.length - 1)]?.id,
    )
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
          `Ticket déplacé vers ${column?.name ?? "la colonne cible"}${filtered ? ", en fin de colonne" : ""}.`,
        )
      }
      return
    }
    if (filtered) {
      setAnnouncement("Le réordonnancement est désactivé dans une vue filtrée.")
      return
    }
    const next = reorderTicket(state, activeTicketId, direction)
    setState(next)
    const nextPosition = next.tickets.find((candidate) => candidate.id === activeTicketId)?.position
    persistTicketPlacement(
      next,
      activeTicketId,
      `Ticket réordonné, position ${(nextPosition ?? 0) + 1}.`,
    )
  }

  useHotkeys(
    [
      { hotkey: "ArrowUp", callback: () => navigateVertical(-1) },
      { hotkey: "ArrowDown", callback: () => navigateVertical(1) },
      { hotkey: "ArrowLeft", callback: () => navigateHorizontal(-1) },
      { hotkey: "ArrowRight", callback: () => navigateHorizontal(1) },
      {
        hotkey: "Enter",
        callback: () => {
          if (activeTicketId !== undefined) {
            onOpenTicket(activeTicketId)
          }
        },
      },
      {
        hotkey: "C",
        callback: () => {
          const active = state.tickets.find((ticket) => ticket.id === activeTicketId)
          const fallback = state.columns.find((column) => !column.done)
          const columnId = active?.columnId ?? fallback?.id
          const column = state.columns.find((candidate) => candidate.id === columnId)
          if (column !== undefined && !column.done) {
            setCreatingColumnId(column.id)
          }
        },
      },
      { hotkey: "/", callback: () => searchRef.current?.focus() },
      {
        hotkey: "Mod+K",
        callback: () => setPaletteOpen(true),
      },
      { hotkey: "M", callback: () => setPaletteOpen(true) },
      { hotkey: "Alt+Shift+ArrowUp", callback: () => keyboardMove(-1, false) },
      { hotkey: "Alt+Shift+ArrowDown", callback: () => keyboardMove(1, false) },
      { hotkey: "Alt+Shift+ArrowLeft", callback: () => keyboardMove(-1, true) },
      { hotkey: "Alt+Shift+ArrowRight", callback: () => keyboardMove(1, true) },
    ],
    {
      target: boardRef,
      enabled: selectedTicket === undefined && !paletteOpen,
      preventDefault: true,
    },
  )

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
      const overTicket = current.tickets.find((ticket) => ticket.id === overId)
      const destinationColumnId = overId.startsWith("column:")
        ? overId.slice("column:".length)
        : overTicket?.columnId

      if (
        source === undefined ||
        destinationColumnId === undefined ||
        destinationColumnId === source.columnId
      ) {
        return current
      }

      return moveTicket(current, ticketId, destinationColumnId, overTicket?.id)
    })
  }

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setDraggedTicketId(undefined)
    dragStartStateRef.current = undefined
    if (over === null) {
      return
    }
    const ticketId = String(active.id)
    const source = state.tickets.find((ticket) => ticket.id === ticketId)
    if (source === undefined) {
      return
    }
    const overId = String(over.id)
    const overTicket = state.tickets.find((ticket) => ticket.id === overId)
    const destinationColumnId = overId.startsWith("column:")
      ? overId.slice("column:".length)
      : overTicket?.columnId
    if (destinationColumnId === undefined) {
      return
    }
    if (filtered && destinationColumnId === source.columnId) {
      setAnnouncement("Le réordonnancement est désactivé dans une vue filtrée.")
      return
    }
    const next = moveTicket(
      state,
      ticketId,
      destinationColumnId,
      filtered || overTicket === undefined ? undefined : overTicket.id,
    )
    setState(next)
    setActiveTicketId(ticketId)
    const column = next.columns.find((candidate) => candidate.id === destinationColumnId)
    const moved = next.tickets.find((ticket) => ticket.id === ticketId)
    persistTicketPlacement(
      next,
      ticketId,
      filtered
        ? `Ticket déplacé vers ${column?.name ?? "la colonne cible"}, en fin de colonne.`
        : `Ticket déplacé vers ${column?.name ?? "la colonne cible"}, position ${(moved?.position ?? 0) + 1}.`,
    )
  }

  const clearFilters = () =>
    onSearchChange({ q: undefined, assignee: undefined, priority: undefined }, true)

  const createInColumn = (columnId: string, title: string) => {
    setCreatingColumnId(undefined)
    void runCommand(
      makeTicketCreateRequest({
        title: title.trim(),
        placement: { columnId: KanbanColumnId.make(columnId) },
      }),
      `Ticket ${title} créé dans la colonne.`,
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
      setAnnouncement("Il faut conserver au moins une colonne non terminale.")
      return
    }
    let next = state
    for (const ticket of ticketsInColumn(state, column.id)) {
      next = moveTicket(next, ticket.id, destination.id)
    }
    setState({ ...next, columns: next.columns.filter((candidate) => candidate.id !== column.id) })
    void runCommand(
      makeKanbanColumnDeleteRequest({
        columnId: KanbanColumnId.make(column.id),
        destinationColumnId: KanbanColumnId.make(destination.id),
      }),
      `Colonne supprimée. Ses tickets ont été déplacés vers ${destination.name}.`,
    )
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {controlPlaneError === undefined ? null : (
        <div className="border-b border-rose-500/25 bg-rose-500/10 px-4 py-2 text-xs text-rose-200">
          Control plane indisponible : {controlPlaneError}
        </div>
      )}
      <header className="border-b border-border/65 bg-background/80 px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 id="board-title" className="text-2xl font-semibold tracking-[-0.04em]">
                Tableau
              </h1>
              <Badge variant="outline" className="rounded-full text-[0.6rem]">
                {loading ? "Chargement…" : `${state.tickets.length} tickets`}
              </Badge>
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 xl:justify-end">
            <div className="relative min-w-56 flex-1 xl:max-w-sm">
              <MagnifyingGlass className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchRef}
                value={search.q ?? ""}
                onChange={(event) =>
                  onSearchChange(
                    { q: event.target.value === "" ? undefined : event.target.value },
                    true,
                  )
                }
                placeholder="Rechercher un ticket…"
                className="pl-9"
              />
              <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border px-1.5 py-0.5 text-[0.58rem] text-muted-foreground">
                /
              </kbd>
            </div>

            <Select
              value={search.assignee ?? "all"}
              onValueChange={(value) =>
                onSearchChange(
                  { assignee: value === null || value === "all" ? undefined : value },
                  true,
                )
              }
            >
              <SelectTrigger size="default">
                <User />
                <SelectValue>
                  {search.assignee === undefined
                    ? "Responsable"
                    : (state.actors.find((actor) => actor.id === search.assignee)?.name ??
                      "Responsable")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les responsables</SelectItem>
                {state.actors.map((actor) => (
                  <SelectItem key={actor.id} value={actor.id}>
                    {actor.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={search.priority ?? "all"}
              onValueChange={(value) => {
                if (value === "all") {
                  onSearchChange({ priority: undefined }, true)
                } else if (value !== null && isTicketPriority(value)) {
                  onSearchChange({ priority: value }, true)
                }
              }}
            >
              <SelectTrigger size="default">
                <Funnel />
                <SelectValue>
                  {search.priority === undefined ? "Priorité" : priorityLabels[search.priority]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les priorités</SelectItem>
                {priorities
                  .filter((priority) => priority !== "none")
                  .map((priority) => (
                    <SelectItem key={priority} value={priority}>
                      {priorityLabels[priority]}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>

            {filtered ? (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X />
                Effacer
              </Button>
            ) : null}

            <Button variant="outline" size="sm" onClick={() => setPaletteOpen(true)}>
              <CommandIcon />
              <span className="hidden sm:inline">Commandes</span>
              <kbd className="ml-1 text-[0.58rem] text-muted-foreground">⌘ K</kbd>
            </Button>
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
                filters={filters}
                activeTicketId={activeTicketId}
                creating={creatingColumnId === column.id}
                editing={editingColumnId === column.id}
                onActiveTicket={setActiveTicketId}
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
                  void runCommand(
                    makeKanbanColumnUpdateRequest({
                      columnId: KanbanColumnId.make(column.id),
                      name: name.trim(),
                    }),
                    `Colonne renommée ${name.trim()}.`,
                  )
                }}
                onColor={(color) => {
                  setState((current) => ({
                    ...current,
                    columns: current.columns.map((candidate) =>
                      candidate.id === column.id ? { ...candidate, color } : candidate,
                    ),
                  }))
                  void runCommand(
                    makeKanbanColumnUpdateRequest({
                      columnId: KanbanColumnId.make(column.id),
                      color,
                    }),
                    `Couleur de la colonne ${column.name} mise à jour.`,
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
                    void runCommand(
                      makeKanbanColumnCreateRequest({
                        name: newColumnName.trim(),
                        color: "#A855F7",
                        ...(done === undefined
                          ? {}
                          : { beforeColumnId: KanbanColumnId.make(done.id) }),
                      }),
                      `Colonne ${newColumnName.trim()} ajoutée.`,
                    )
                    setNewColumnName("")
                    setAddingColumn(false)
                  }}
                  className="rounded-2xl border bg-card p-3"
                >
                  <Input
                    value={newColumnName}
                    onChange={(event) => setNewColumnName(event.target.value)}
                    placeholder="Nom de la colonne"
                    autoFocus
                  />
                  <div className="mt-2 flex gap-2">
                    <Button type="submit" size="xs" disabled={newColumnName.trim() === ""}>
                      Ajouter
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => setAddingColumn(false)}
                    >
                      Annuler
                    </Button>
                  </div>
                </form>
              ) : (
                <Button
                  variant="outline"
                  className="w-full justify-start border-dashed bg-card/35 text-muted-foreground"
                  onClick={() => setAddingColumn(true)}
                >
                  <Plus />
                  Ajouter une colonne
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

      <TicketSheet
        ticket={selectedTicket}
        actors={state.actors}
        onClose={() => {
          const ticketId = selectedTicket?.id
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
        onUpdate={(ticketId, patch) => {
          setState((current) => updateTicket(current, ticketId, patch))
          if ("assigneeId" in patch) {
            void runCommand(
              makeTicketAssignRequest({
                ticketId: TicketId.make(ticketId),
                ...(patch.assigneeId === undefined
                  ? {}
                  : { assigneeId: ActorId.make(patch.assigneeId) }),
              }),
              "Responsable du ticket mis à jour.",
            )
          }
          const hasDetails =
            patch.title !== undefined ||
            patch.description !== undefined ||
            patch.priority !== undefined ||
            "dueAt" in patch
          if (hasDetails) {
            void runCommand(
              makeTicketUpdateRequest({
                ticketId: TicketId.make(ticketId),
                ...(patch.title === undefined ? {} : { title: patch.title }),
                ...(patch.description === undefined ? {} : { description: patch.description }),
                ...(patch.priority === undefined ? {} : { priority: patch.priority }),
                ...(!("dueAt" in patch)
                  ? {}
                  : { dueAt: patch.dueAt === undefined ? null : patch.dueAt }),
              }),
              "Détails du ticket mis à jour.",
            )
          }
        }}
        onToggleChecklist={(ticketId, itemId) =>
          setState((current) => toggleChecklistItem(current, ticketId, itemId))
        }
        onStartExecution={(ticketId, input) => {
          setState((current) => startExecution(current, ticketId, input.profileName))
          void runCommand(
            makeExecutionStartRequest({
              ticketId: TicketId.make(ticketId),
              expectedOutcome: input.outcome,
              agentProfileId: AgentProfileId.make(input.profileId),
            }),
            `Exécution lancée avec ${input.profileName}.`,
          )
        }}
        onReply={(ticketId, message) =>
          setState((current) => appendWorkbenchMessage(current, ticketId, message))
        }
      />

      <CommandDialog
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        title="Commandes du Tableau"
        description="Rechercher un ticket ou lancer une commande."
      >
        <CommandInput placeholder="Rechercher une commande ou un ticket…" />
        <CommandList>
          <CommandEmpty>Aucun résultat.</CommandEmpty>
          <CommandGroup heading="Commandes">
            <CommandItem
              onSelect={() => {
                setPaletteOpen(false)
                const column = state.columns.find((candidate) => !candidate.done)
                setCreatingColumnId(column?.id)
              }}
            >
              <Plus />
              Créer un ticket
              <CommandShortcut>C</CommandShortcut>
            </CommandItem>
            <CommandItem
              onSelect={() => {
                setPaletteOpen(false)
                searchRef.current?.focus()
              }}
            >
              <MagnifyingGlass />
              Rechercher
              <CommandShortcut>/</CommandShortcut>
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading="Déplacer le ticket actif">
            {state.columns.map((column) => (
              <CommandItem
                key={column.id}
                disabled={activeTicketId === undefined}
                onSelect={() => {
                  if (activeTicketId !== undefined) {
                    const next = moveTicket(state, activeTicketId, column.id)
                    setState(next)
                    persistTicketPlacement(
                      next,
                      activeTicketId,
                      `Ticket déplacé vers ${column.name}, en fin de colonne.`,
                    )
                  }
                  setPaletteOpen(false)
                }}
              >
                <span className="size-2 rounded-full" style={{ backgroundColor: column.color }} />
                {column.name}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Tickets">
            {state.tickets.map((ticket) => (
              <CommandItem
                key={ticket.id}
                value={`${ticket.title} ${ticket.labels.join(" ")}`}
                onSelect={() => {
                  setPaletteOpen(false)
                  onOpenTicket(ticket.id)
                }}
              >
                <DotOutline className={priorityStyles[ticket.priority]} />
                <span className="truncate">{ticket.title}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </main>
  )
}
