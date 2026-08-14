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
import type { TicketPriority } from "@noyau/protocol/entities/ticket"
import { useHotkeys } from "@tanstack/react-hotkeys"
import { differenceInCalendarDays, format, parseISO, startOfToday } from "date-fns"
import { fr } from "date-fns/locale"
import {
  BotIcon,
  CalendarIcon,
  CheckCircleIcon,
  CircleAlertIcon,
  CircleIcon,
  CommandIcon,
  EllipsisIcon,
  FunnelIcon,
  GripVerticalIcon,
  PlusIcon,
  SearchIcon,
  UserIcon,
  XIcon,
} from "lucide-react"
import { useRef, useState, type CSSProperties, type FormEvent, type RefObject } from "react"

import { TicketSheet } from "@/components/board/TicketSheet"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandCollection,
  CommandDialog,
  CommandDialogPopup,
  CommandEmpty,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command"
import { Input } from "@/components/ui/input"
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
import {
  addColumn,
  appendWorkbenchMessage,
  createTicket,
  initialBoardState,
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
  readonly search: BoardSearch
  readonly onSearchChange: (patch: BoardSearchPatch, replace?: boolean) => void
  readonly onOpenTicket: (ticketId: string) => void
  readonly onCloseTicket: () => void
}

type CommandPaletteItem =
  | {
      readonly kind: "action"
      readonly value: "create" | "search"
      readonly label: string
      readonly shortcut: string
    }
  | {
      readonly kind: "move"
      readonly value: string
      readonly label: string
      readonly columnId: string
      readonly color: string
    }
  | {
      readonly kind: "ticket"
      readonly value: string
      readonly label: string
      readonly ticketId: string
      readonly priority: TicketPriority
    }

interface CommandPaletteGroup {
  readonly value: string
  readonly label: string
  readonly items: ReadonlyArray<CommandPaletteItem>
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
          <CircleIcon className={cn("mt-0.5 size-3.5 shrink-0", priorityStyles[ticket.priority])} />
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

        {ticket.attention === undefined ? null : (
          <Badge
            variant="outline"
            className={cn(
              "mt-3 rounded-md px-1.5 text-[0.58rem]",
              attentionStyles[ticket.attention],
            )}
          >
            <CircleAlertIcon />
            {attentionLabels[ticket.attention]}
          </Badge>
        )}

        {ticket.execution === undefined ? null : (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-muted/55 px-2.5 py-2">
            <BotIcon className="size-3.5 shrink-0 text-violet-400" />
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
              <UserIcon className="size-2.5" />
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
              <CalendarIcon className="size-3" />
              {due.label}
            </span>
          )}
          {ticket.checklist.length === 0 ? null : (
            <span className="ml-auto flex items-center gap-1 text-[0.6rem] text-muted-foreground">
              <CheckCircleIcon className="size-3" />
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
        <PlusIcon />
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
          <XIcon />
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
        <Menu>
          <MenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Menu de la colonne ${column.name}`}
              >
                <EllipsisIcon />
              </Button>
            }
          />
          <MenuPopup align="end" className="w-44">
            <MenuGroup>
              <MenuGroupLabel>{column.name}</MenuGroupLabel>
              <MenuItem onClick={() => onEditingChange(true)}>Renommer</MenuItem>
            </MenuGroup>
            <MenuSeparator />
            <MenuGroup>
              <MenuGroupLabel>Couleur</MenuGroupLabel>
              {[
                ["Violet", "#6D5BD0"],
                ["Bleu", "#3B82F6"],
                ["Émeraude", "#10B981"],
                ["Ambre", "#F59E0B"],
              ].map(([label, color]) => (
                <MenuItem key={color} onClick={() => onColor(color ?? "#6D5BD0")}>
                  <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
                  {label}
                </MenuItem>
              ))}
            </MenuGroup>
            {column.done ? null : (
              <>
                <MenuSeparator />
                <MenuItem variant="destructive" onClick={onDelete}>
                  Supprimer
                </MenuItem>
              </>
            )}
          </MenuPopup>
        </Menu>
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

export function BoardPage({ search, onSearchChange, onOpenTicket, onCloseTicket }: BoardPageProps) {
  const [state, setState] = useState(initialBoardState)
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
  const localId = useRef(0)
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
  const assigneeOptions = [
    { value: "all", label: "Tous les responsables" },
    ...state.actors.map((actor) => ({ value: actor.id, label: actor.name })),
  ]
  const priorityOptions = [
    { value: "all", label: "Toutes les priorités" },
    ...priorities
      .filter((priority) => priority !== "none")
      .map((priority) => ({ value: priority, label: priorityLabels[priority] })),
  ]
  const commandGroups: ReadonlyArray<CommandPaletteGroup> = [
    {
      value: "actions",
      label: "Commandes",
      items: [
        { kind: "action", value: "create", label: "Créer un ticket", shortcut: "C" },
        { kind: "action", value: "search", label: "Rechercher", shortcut: "/" },
      ],
    },
    {
      value: "move",
      label: "Déplacer le ticket actif",
      items: state.columns.map((column) => ({
        kind: "move",
        value: `move:${column.id}`,
        label: column.name,
        columnId: column.id,
        color: column.color,
      })),
    },
    {
      value: "tickets",
      label: "Tickets",
      items: state.tickets.map((ticket) => ({
        kind: "ticket",
        value: `ticket:${ticket.id}:${ticket.title}:${ticket.labels.join(":")}`,
        label: ticket.title,
        ticketId: ticket.id,
        priority: ticket.priority,
      })),
    },
  ]

  const visibleByColumn = new Map(
    state.columns.map((column) => [column.id, visibleTickets(state, column.id, filters)]),
  )

  const setActiveAndFocus = (ticketId: string | undefined) => {
    setActiveTicketId(ticketId)
    requestAnimationFrame(() => focusTicket(boardRef, ticketId))
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
        setAnnouncement(
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
    setAnnouncement(`Ticket réordonné, position ${(nextPosition ?? 0) + 1}.`)
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
    setAnnouncement(
      filtered
        ? `Ticket déplacé vers ${column?.name ?? "la colonne cible"}, en fin de colonne.`
        : `Ticket déplacé vers ${column?.name ?? "la colonne cible"}, position ${(moved?.position ?? 0) + 1}.`,
    )
  }

  const clearFilters = () =>
    onSearchChange({ q: undefined, assignee: undefined, priority: undefined }, true)

  const runCommandPaletteItem = (item: CommandPaletteItem) => {
    setPaletteOpen(false)
    if (item.kind === "action") {
      if (item.value === "create") {
        const column = state.columns.find((candidate) => !candidate.done)
        setCreatingColumnId(column?.id)
      } else {
        requestAnimationFrame(() => searchRef.current?.focus())
      }
      return
    }
    if (item.kind === "move") {
      if (activeTicketId !== undefined) {
        setState((current) => moveTicket(current, activeTicketId, item.columnId))
        setAnnouncement(`Ticket déplacé vers ${item.label}, en fin de colonne.`)
      }
      return
    }
    onOpenTicket(item.ticketId)
  }

  const createInColumn = (columnId: string, title: string) => {
    localId.current += 1
    const ticketId = `ticket-local-${localId.current}`
    setState((current) => createTicket(current, { id: ticketId, columnId, title }))
    setCreatingColumnId(undefined)
    setActiveTicketId(ticketId)
    setAnnouncement(`Ticket ${title} créé dans la colonne.`)
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
    setAnnouncement(`Colonne supprimée. Ses tickets ont été déplacés vers ${destination.name}.`)
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="border-b border-border/65 bg-background/80 px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 id="board-title" className="text-2xl font-semibold tracking-[-0.04em]">
                Tableau
              </h1>
              <Badge variant="outline" className="rounded-full text-[0.6rem]">
                {state.tickets.length} tickets
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
                placeholder="Rechercher un ticket…"
                className="pl-9"
              />
              <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border px-1.5 py-0.5 text-[0.58rem] text-muted-foreground">
                /
              </kbd>
            </div>

            <Select
              items={assigneeOptions}
              value={search.assignee ?? "all"}
              onValueChange={(value) =>
                onSearchChange(
                  { assignee: value === null || value === "all" ? undefined : value },
                  true,
                )
              }
            >
              <SelectTrigger size="default">
                <UserIcon />
                <SelectValue>
                  {search.assignee === undefined
                    ? "Responsable"
                    : (state.actors.find((actor) => actor.id === search.assignee)?.name ??
                      "Responsable")}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {assigneeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>

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
              <SelectTrigger size="default">
                <FunnelIcon />
                <SelectValue>
                  {search.priority === undefined ? "Priorité" : priorityLabels[search.priority]}
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
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <XIcon />
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
                onRename={(name) =>
                  setState((current) => ({
                    ...current,
                    columns: current.columns.map((candidate) =>
                      candidate.id === column.id ? { ...candidate, name: name.trim() } : candidate,
                    ),
                  }))
                }
                onColor={(color) =>
                  setState((current) => ({
                    ...current,
                    columns: current.columns.map((candidate) =>
                      candidate.id === column.id ? { ...candidate, color } : candidate,
                    ),
                  }))
                }
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
                    localId.current += 1
                    setState((current) =>
                      addColumn(current, newColumnName, `column-local-${localId.current}`),
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
                  <PlusIcon />
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
        onUpdate={(ticketId, patch) =>
          setState((current) => updateTicket(current, ticketId, patch))
        }
        onToggleChecklist={(ticketId, itemId) =>
          setState((current) => toggleChecklistItem(current, ticketId, itemId))
        }
        onStartExecution={(ticketId, profile) =>
          setState((current) => startExecution(current, ticketId, profile))
        }
        onReply={(ticketId, message) =>
          setState((current) => appendWorkbenchMessage(current, ticketId, message))
        }
      />

      <CommandDialog open={paletteOpen} onOpenChange={setPaletteOpen}>
        <CommandDialogPopup>
          <Command items={commandGroups}>
            <CommandInput placeholder="Rechercher une commande ou un ticket…" />
            <CommandEmpty>Aucun résultat.</CommandEmpty>
            <CommandList>
              {(group: CommandPaletteGroup) => (
                <CommandGroup key={group.value} items={group.items}>
                  <CommandGroupLabel>{group.label}</CommandGroupLabel>
                  <CommandCollection>
                    {(item: CommandPaletteItem) => (
                      <CommandItem
                        key={item.value}
                        value={item.value}
                        disabled={item.kind === "move" && activeTicketId === undefined}
                        onClick={() => runCommandPaletteItem(item)}
                      >
                        {item.kind === "action" ? (
                          item.value === "create" ? (
                            <PlusIcon />
                          ) : (
                            <SearchIcon />
                          )
                        ) : item.kind === "move" ? (
                          <span
                            className="size-2 rounded-full"
                            style={{ backgroundColor: item.color }}
                          />
                        ) : (
                          <CircleIcon className={priorityStyles[item.priority]} />
                        )}
                        <span className="truncate">{item.label}</span>
                        {item.kind === "action" ? (
                          <CommandShortcut>{item.shortcut}</CommandShortcut>
                        ) : null}
                      </CommandItem>
                    )}
                  </CommandCollection>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </CommandDialogPopup>
      </CommandDialog>
    </main>
  )
}
