import type { TicketPriority } from "@noyau/contracts/entities/ticket"
import type { TicketThread } from "@noyau/contracts/entities/ticket-thread"
import type { EventEnvelope } from "@noyau/contracts/events"
import { ThreadId } from "@noyau/contracts/ids"
import type { ThreadShell } from "@noyau/contracts/shell"
import { format, isValid, parseISO } from "date-fns"
import { enUS } from "date-fns/locale"
import {
  ActivityIcon,
  ArchiveIcon,
  CalendarIcon,
  GitBranchIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { TicketActivityThreadChip } from "@/components/board/TicketActivityThreadChip"
import { TicketArchiveConfirmDialog } from "@/components/board/TicketArchiveConfirmDialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { KeyboardShortcut } from "@/components/ui/keyboard-shortcut"
import { Label } from "@/components/ui/label"
import { Popover, PopoverClose, PopoverPopup, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  dependenciesForTicket,
  dependentsForTicket,
  isTicketPriority,
  priorities,
  ticketDependencyIssue,
  type BoardColumn,
  type BoardTicket,
  type BoardTicketDependency,
  type BoardTicketPatch,
  type TicketDependencyIssue,
} from "@/lib/board-model"
import { ticketActivityItem } from "@/lib/ticket-activity"

const priorityLabels = {
  none: "None",
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
} satisfies Record<TicketPriority, string>

const priorityDots = {
  none: "bg-muted-foreground",
  low: "bg-info",
  normal: "bg-primary",
  high: "bg-warning",
  urgent: "bg-destructive",
} satisfies Record<TicketPriority, string>

const dependencyIssueLabels = {
  self: "Current ticket",
  duplicate: "Already linked",
  cycle: "Would create a cycle",
} satisfies Record<TicketDependencyIssue, string>

const parseTicketDueDate = (dueAt: string | undefined): Date | undefined => {
  if (dueAt === undefined) {
    return undefined
  }

  const date = parseISO(dueAt.slice(0, 10))
  return isValid(date) ? date : undefined
}

const dependencyTitle = (tickets: ReadonlyArray<BoardTicket>, ticketId: string): string =>
  tickets.find((ticket) => ticket.id === ticketId)?.title ?? ticketId

interface TicketDialogProps {
  readonly ticket: BoardTicket | undefined
  readonly tickets: ReadonlyArray<BoardTicket>
  readonly columns: ReadonlyArray<BoardColumn>
  readonly ticketDependencies: ReadonlyArray<BoardTicketDependency>
  readonly ticketThreads: ReadonlyArray<TicketThread>
  readonly threads: ReadonlyArray<ThreadShell>
  readonly activity: ReadonlyArray<EventEnvelope>
  readonly activityLoading: boolean
  readonly activityError?: string
  readonly focusTitle: boolean
  readonly onClose: () => void
  readonly onTitleFocusComplete: () => void
  readonly onUpdate: (ticketId: string, patch: BoardTicketPatch) => void
  readonly onAddDependency: (ticketId: string, dependsOnTicketId: string) => void
  readonly onRemoveDependency: (ticketId: string, dependsOnTicketId: string) => void
  readonly onLinkThread: (ticketId: string, threadId: ThreadShell["id"]) => void
  readonly onUnlinkThread: (ticketId: string, threadId: ThreadShell["id"]) => void
  readonly onOpenThread?: (threadId: ThreadShell["id"]) => void
  readonly archiveBlockedByTitles: ReadonlyArray<string>
  readonly onArchive: (ticketId: string) => void
}

export function TicketDialog({
  ticket,
  tickets,
  columns,
  ticketDependencies,
  ticketThreads,
  threads,
  activity,
  activityLoading,
  activityError,
  focusTitle,
  onClose,
  onTitleFocusComplete,
  onUpdate,
  onAddDependency,
  onRemoveDependency,
  onLinkThread,
  onUnlinkThread,
  onOpenThread,
  archiveBlockedByTitles,
  onArchive,
}: TicketDialogProps) {
  const [title, setTitle] = useState(ticket?.title ?? "")
  const [titleError, setTitleError] = useState(false)
  const [description, setDescription] = useState(ticket?.description ?? "")
  const [editingDescription, setEditingDescription] = useState(false)
  const [dueDateOpen, setDueDateOpen] = useState(false)
  const [blockedBySelection, setBlockedBySelection] = useState<string | null>(null)
  const [blocksSelection, setBlocksSelection] = useState<string | null>(null)
  const [linkedThreadSelection, setLinkedThreadSelection] = useState<string | null>(null)
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const dependencyState = useMemo(() => ({ ticketDependencies }), [ticketDependencies])

  useEffect(() => {
    setTitle(ticket?.title ?? "")
    setTitleError(false)
    setDescription(ticket?.description ?? "")
    setEditingDescription(false)
    setDueDateOpen(false)
    setBlockedBySelection(null)
    setBlocksSelection(null)
    setLinkedThreadSelection(null)
    setArchiveConfirmOpen(false)
  }, [ticket])

  useEffect(() => {
    if (!focusTitle || ticket === undefined) {
      return
    }
    const frame = requestAnimationFrame(() => {
      titleInputRef.current?.focus()
      titleInputRef.current?.select()
      onTitleFocusComplete()
    })
    return () => cancelAnimationFrame(frame)
  }, [focusTitle, onTitleFocusComplete, ticket])

  const saveTitle = () => {
    const nextTitle = title.trim()
    if (ticket === undefined) {
      return
    }
    if (nextTitle === "") {
      setTitleError(true)
      return
    }
    setTitleError(false)
    if (nextTitle !== ticket.title) {
      onUpdate(ticket.id, { title: nextTitle })
    }
  }

  const saveDescription = () => {
    if (ticket !== undefined && description !== ticket.description) {
      onUpdate(ticket.id, { description })
    }
    setEditingDescription(false)
  }

  const dueDate = parseTicketDueDate(ticket?.dueAt)
  const updateDueDate = (date: Date | undefined) => {
    if (ticket === undefined) {
      return
    }
    onUpdate(ticket.id, {
      dueAt: date === undefined ? undefined : `${format(date, "yyyy-MM-dd")}T17:00:00.000Z`,
    })
    setDueDateOpen(false)
  }

  const blockedByIds = ticket === undefined ? [] : dependenciesForTicket(dependencyState, ticket.id)
  const blocksIds = ticket === undefined ? [] : dependentsForTicket(dependencyState, ticket.id)
  const linkedThreadIds =
    ticket === undefined
      ? []
      : ticketThreads
          .filter((ticketThread) => ticketThread.ticketId === ticket.id)
          .map((ticketThread) => ticketThread.threadId)
  const linkedThreadSet = new Set(linkedThreadIds)
  const linkableThreads = threads.filter((thread) => !linkedThreadSet.has(thread.id))
  const dependencyOptions =
    ticket === undefined
      ? []
      : tickets.map((candidate) => ({
          value: candidate.id,
          label: candidate.title,
          issue: ticketDependencyIssue(dependencyState, ticket.id, candidate.id),
        }))
  const dependentOptions =
    ticket === undefined
      ? []
      : tickets.map((candidate) => ({
          value: candidate.id,
          label: candidate.title,
          issue: ticketDependencyIssue(dependencyState, candidate.id, ticket.id),
        }))
  const activityContext = useMemo(
    () => ({
      columnsById: new Map(columns.map((column) => [column.id, { name: column.name }])),
      threadsById: new Map(
        threads.map((thread) => [thread.id, { title: thread.title, status: thread.status }]),
      ),
      ticketsById: new Map(tickets.map((item) => [item.id, { title: item.title }])),
    }),
    [columns, threads, tickets],
  )

  const activityItems = activity.map((envelope) => ticketActivityItem(envelope, activityContext))
  const priorityOptions = priorities.map((priority) => ({
    value: priority,
    label: priorityLabels[priority],
  }))

  return (
    <Dialog
      open={ticket !== undefined}
      onOpenChange={(open) => {
        if (!open) {
          onClose()
        }
      }}
    >
      <DialogPopup
        bottomStickOnMobile={false}
        closeProps={{ "aria-label": "Close ticket" }}
        className="gap-0 p-0 sm:max-h-[min(52rem,calc(100dvh-2rem))] sm:max-w-4xl"
      >
        {ticket === undefined ? null : (
          <>
            <DialogHeader className="border-b px-6 py-5 pr-14">
              <Badge variant="outline" className="mb-2 w-fit rounded-full text-[0.62rem]">
                NOY-{ticket.id.replace("ticket-", "").slice(0, 4).toLocaleUpperCase("en")}
              </Badge>
              <DialogTitle className="sr-only">Ticket details {ticket.title}</DialogTitle>
              <Label htmlFor="ticket-title" className="sr-only">
                Ticket title
              </Label>
              <Input
                id="ticket-title"
                ref={titleInputRef}
                type="text"
                value={title}
                required
                aria-invalid={titleError}
                aria-describedby={titleError ? "ticket-title-error" : undefined}
                onChange={(event) => {
                  setTitle(event.target.value)
                  if (event.target.value.trim() !== "") {
                    setTitleError(false)
                  }
                }}
                onBlur={saveTitle}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.currentTarget.blur()
                  }
                }}
                className="-ml-2 h-auto border-transparent bg-transparent px-2 py-1 text-xl font-semibold tracking-[-0.03em] shadow-none focus-visible:border-input"
              />
              {titleError ? (
                <p id="ticket-title-error" className="text-xs text-destructive">
                  Title is required.
                </p>
              ) : null}
              <DialogDescription>Edit the details without leaving the Board.</DialogDescription>
            </DialogHeader>

            <DialogPanel className="p-0">
              <div className="space-y-8 px-6 py-6">
                <section aria-labelledby="ticket-details-title">
                  <h3 id="ticket-details-title" className="mb-4 text-sm font-medium">
                    Details
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label
                        htmlFor="ticket-priority"
                        className="text-[0.68rem] text-muted-foreground"
                      >
                        Priority
                      </Label>
                      <Select
                        items={priorityOptions}
                        value={ticket.priority}
                        onValueChange={(value) => {
                          if (value !== null && isTicketPriority(value)) {
                            onUpdate(ticket.id, { priority: value })
                          }
                        }}
                      >
                        <SelectTrigger id="ticket-priority" className="w-full">
                          <SelectValue>
                            <span
                              className={`size-2 rounded-full ${priorityDots[ticket.priority]}`}
                            />
                            {priorityLabels[ticket.priority]}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectPopup>
                          {priorityOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              <span
                                className={`size-2 rounded-full ${priorityDots[option.value]}`}
                              />
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectPopup>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label
                        htmlFor="ticket-due-at"
                        className="text-[0.68rem] text-muted-foreground"
                      >
                        Due date
                      </Label>
                      <Popover open={dueDateOpen} onOpenChange={setDueDateOpen}>
                        <PopoverTrigger
                          id="ticket-due-at"
                          aria-label="Select a due date"
                          render={
                            <Button
                              type="button"
                              className="w-full justify-start text-left font-normal"
                              variant="outline"
                            />
                          }
                        >
                          <CalendarIcon aria-hidden="true" />
                          {dueDate === undefined ? (
                            <span className="text-muted-foreground">No date</span>
                          ) : (
                            format(dueDate, "MMM d, yyyy")
                          )}
                        </PopoverTrigger>
                        <PopoverPopup align="start" className="w-auto p-0">
                          <div className="flex items-center justify-between border-b px-3 py-2">
                            <span className="text-xs font-medium">Due date</span>
                            <PopoverClose
                              disabled={dueDate === undefined}
                              onClick={() => updateDueDate(undefined)}
                              render={
                                <Button type="button" size="xs" variant="ghost">
                                  Clear
                                </Button>
                              }
                            />
                          </div>
                          <Calendar
                            mode="single"
                            onSelect={updateDueDate}
                            {...(dueDate === undefined
                              ? {}
                              : { defaultMonth: dueDate, selected: dueDate })}
                          />
                        </PopoverPopup>
                      </Popover>
                    </div>
                  </div>

                  <div className="mt-5 space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="ticket-description">Description</Label>
                      {editingDescription ? null : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() => setEditingDescription(true)}
                        >
                          Edit
                        </Button>
                      )}
                    </div>
                    {editingDescription ? (
                      <div className="space-y-2">
                        <Textarea
                          id="ticket-description"
                          value={description}
                          aria-label="Ticket description in Markdown"
                          onChange={(event) => setDescription(event.target.value)}
                          onKeyDown={(event) => {
                            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                              event.preventDefault()
                              saveDescription()
                            }
                          }}
                          rows={8}
                          autoFocus
                        />
                        <div className="flex items-center justify-end gap-2">
                          <span className="mr-auto flex items-center gap-1 text-[0.65rem] text-muted-foreground">
                            Markdown · <KeyboardShortcut hotkey="Mod+Enter" />
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setDescription(ticket.description)
                              setEditingDescription(false)
                            }}
                          >
                            Cancel
                          </Button>
                          <Button type="button" size="sm" onClick={saveDescription}>
                            Save
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-xl bg-muted/35 px-4 py-3 text-sm leading-relaxed">
                        {ticket.description === "" ? (
                          <button
                            type="button"
                            className="w-full text-left text-muted-foreground"
                            onClick={() => setEditingDescription(true)}
                          >
                            Add a description…
                          </button>
                        ) : (
                          <div className="space-y-3 break-words [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_li]:ml-5 [&_ol]:list-decimal [&_p]:leading-relaxed [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:p-2 [&_th]:border [&_th]:p-2 [&_ul]:list-disc">
                            <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
                              {ticket.description}
                            </ReactMarkdown>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </section>

                <section aria-labelledby="ticket-dependencies-title">
                  <h3 id="ticket-dependencies-title" className="mb-3 text-sm font-medium">
                    Dependencies
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-3 rounded-xl border p-3">
                      <div className="flex items-center gap-2 text-xs font-medium">
                        <GitBranchIcon className="size-3.5 text-muted-foreground" />
                        Blocked by
                      </div>
                      {blockedByIds.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No tickets.</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {blockedByIds.map((dependsOnTicketId) => (
                            <li
                              key={dependsOnTicketId}
                              className="flex items-center gap-2 rounded-lg bg-muted/35 px-2.5 py-2 text-xs"
                            >
                              <span className="min-w-0 flex-1 truncate">
                                {dependencyTitle(tickets, dependsOnTicketId)}
                              </span>
                              <Button
                                type="button"
                                size="icon-xs"
                                variant="ghost"
                                aria-label={`Remove ${dependencyTitle(tickets, dependsOnTicketId)} from prerequisites`}
                                onClick={() => onRemoveDependency(ticket.id, dependsOnTicketId)}
                              >
                                <Trash2Icon aria-hidden="true" />
                              </Button>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="space-y-1.5">
                        <Label htmlFor="ticket-blocked-by-add" className="sr-only">
                          Add a blocking ticket
                        </Label>
                        <Select
                          items={dependencyOptions}
                          value={blockedBySelection}
                          onValueChange={(value) => {
                            setBlockedBySelection(value)
                            if (
                              value !== null &&
                              ticketDependencyIssue(dependencyState, ticket.id, value) === undefined
                            ) {
                              onAddDependency(ticket.id, value)
                              setBlockedBySelection(null)
                            }
                          }}
                        >
                          <SelectTrigger id="ticket-blocked-by-add" size="sm" className="w-full">
                            <PlusIcon aria-hidden="true" />
                            <SelectValue placeholder="Add a prerequisite" />
                          </SelectTrigger>
                          <SelectPopup alignItemWithTrigger={false}>
                            {dependencyOptions.map((option) => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                                disabled={option.issue !== undefined}
                              >
                                <span className="flex min-w-0 items-center justify-between gap-3">
                                  <span className="truncate">{option.label}</span>
                                  {option.issue === undefined ? null : (
                                    <span className="text-[0.65rem] text-muted-foreground">
                                      {dependencyIssueLabels[option.issue]}
                                    </span>
                                  )}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectPopup>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-3 rounded-xl border p-3">
                      <div className="flex items-center gap-2 text-xs font-medium">
                        <GitBranchIcon className="size-3.5 rotate-180 text-muted-foreground" />
                        Blocks
                      </div>
                      {blocksIds.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No tickets.</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {blocksIds.map((dependentTicketId) => (
                            <li
                              key={dependentTicketId}
                              className="flex items-center gap-2 rounded-lg bg-muted/35 px-2.5 py-2 text-xs"
                            >
                              <span className="min-w-0 flex-1 truncate">
                                {dependencyTitle(tickets, dependentTicketId)}
                              </span>
                              <Button
                                type="button"
                                size="icon-xs"
                                variant="ghost"
                                aria-label={`Stop blocking ${dependencyTitle(tickets, dependentTicketId)}`}
                                onClick={() => onRemoveDependency(dependentTicketId, ticket.id)}
                              >
                                <Trash2Icon aria-hidden="true" />
                              </Button>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="space-y-1.5">
                        <Label htmlFor="ticket-blocks-add" className="sr-only">
                          Add a blocked ticket
                        </Label>
                        <Select
                          items={dependentOptions}
                          value={blocksSelection}
                          onValueChange={(value) => {
                            setBlocksSelection(value)
                            if (
                              value !== null &&
                              ticketDependencyIssue(dependencyState, value, ticket.id) === undefined
                            ) {
                              onAddDependency(value, ticket.id)
                              setBlocksSelection(null)
                            }
                          }}
                        >
                          <SelectTrigger id="ticket-blocks-add" size="sm" className="w-full">
                            <PlusIcon aria-hidden="true" />
                            <SelectValue placeholder="Add a blocked ticket" />
                          </SelectTrigger>
                          <SelectPopup alignItemWithTrigger={false}>
                            {dependentOptions.map((option) => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                                disabled={option.issue !== undefined}
                              >
                                <span className="flex min-w-0 items-center justify-between gap-3">
                                  <span className="truncate">{option.label}</span>
                                  {option.issue === undefined ? null : (
                                    <span className="text-[0.65rem] text-muted-foreground">
                                      {dependencyIssueLabels[option.issue]}
                                    </span>
                                  )}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectPopup>
                        </Select>
                      </div>
                    </div>
                  </div>
                </section>

                <section aria-labelledby="ticket-threads-title">
                  <h3 id="ticket-threads-title" className="mb-3 text-sm font-medium">
                    Linked Threads
                  </h3>
                  {linkedThreadIds.length === 0 ? (
                    <p className="mb-3 text-xs text-muted-foreground">No linked Thread.</p>
                  ) : (
                    <ul className="mb-3 space-y-1.5">
                      {linkedThreadIds.map((threadId) => {
                        const thread = threads.find((candidate) => candidate.id === threadId)
                        return (
                          <li
                            key={threadId}
                            className="flex items-center gap-2 rounded-lg bg-muted/35 px-2.5 py-2 text-xs"
                          >
                            <span className="min-w-0 flex-1 truncate">
                              {thread?.title ?? threadId}
                            </span>
                            <Button
                              type="button"
                              size="icon-xs"
                              variant="ghost"
                              aria-label={`Unlink Thread ${thread?.title ?? threadId}`}
                              onClick={() => onUnlinkThread(ticket.id, threadId)}
                            >
                              <Trash2Icon aria-hidden="true" />
                            </Button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                  <Select
                    items={linkableThreads.map((thread) => ({
                      value: thread.id,
                      label: thread.title,
                    }))}
                    value={linkedThreadSelection}
                    onValueChange={(value) => {
                      setLinkedThreadSelection(value)
                      if (value !== null) {
                        onLinkThread(ticket.id, ThreadId.make(value))
                        setLinkedThreadSelection(null)
                      }
                    }}
                  >
                    <SelectTrigger
                      id="ticket-thread-link"
                      size="sm"
                      className="w-full"
                      disabled={linkableThreads.length === 0}
                    >
                      <PlusIcon aria-hidden="true" />
                      <SelectValue
                        placeholder={
                          linkableThreads.length === 0
                            ? "All Threads are linked"
                            : "Add a linked Thread"
                        }
                      />
                    </SelectTrigger>
                    <SelectPopup alignItemWithTrigger={false}>
                      {linkableThreads.map((thread) => (
                        <SelectItem key={thread.id} value={thread.id}>
                          {thread.title}
                        </SelectItem>
                      ))}
                    </SelectPopup>
                  </Select>
                </section>

                <section aria-labelledby="ticket-activity-title" className="border-t pt-5">
                  <div className="mb-4 flex items-center gap-2">
                    <ActivityIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                    <h3 id="ticket-activity-title" className="text-sm font-medium">
                      System activity
                    </h3>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {activityItems.length}
                    </span>
                  </div>
                  {activityLoading ? (
                    <p className="text-xs text-muted-foreground">Loading activity…</p>
                  ) : activityError !== undefined ? (
                    <p className="text-xs text-destructive">
                      Activity unavailable: {activityError}
                    </p>
                  ) : activityItems.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No activity recorded.</p>
                  ) : (
                    <ol className="space-y-4">
                      {activityItems.map((item) => (
                        <li key={item.id} className="flex gap-3">
                          <div className="mt-1 grid size-6 shrink-0 place-items-center rounded-full bg-muted">
                            <ActivityIcon
                              className="size-3 text-muted-foreground"
                              aria-hidden="true"
                            />
                          </div>
                          <div>
                            <p className="text-xs">
                              {item.actorThread === undefined ? (
                                <span className="font-medium">{item.actor}</span>
                              ) : (
                                <TicketActivityThreadChip
                                  thread={item.actorThread}
                                  onOpenThread={onOpenThread}
                                />
                              )}{" "}
                              {item.parts.map((part, index) =>
                                part.kind === "text" ? (
                                  <span key={`${item.id}-text-${String(index)}`}>{part.text}</span>
                                ) : (
                                  <TicketActivityThreadChip
                                    key={`${item.id}-thread-${part.thread.threadId}`}
                                    thread={part.thread}
                                    onOpenThread={onOpenThread}
                                  />
                                ),
                              )}
                            </p>
                            <time
                              dateTime={item.occurredAt}
                              className="mt-0.5 block text-[0.65rem] text-muted-foreground"
                            >
                              {format(parseISO(item.occurredAt), "d MMMM yyyy 'at' HH:mm", {
                                locale: enUS,
                              })}
                            </time>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              </div>
            </DialogPanel>
            <DialogFooter className="sm:justify-start">
              <Button
                type="button"
                variant="destructive-outline"
                onClick={() => setArchiveConfirmOpen(true)}
              >
                <ArchiveIcon />
                Archive
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogPopup>
      {ticket === undefined ? null : (
        <TicketArchiveConfirmDialog
          open={archiveConfirmOpen}
          ticketTitle={ticket.title}
          blockedByTitles={archiveBlockedByTitles}
          onOpenChange={setArchiveConfirmOpen}
          onConfirm={() => onArchive(ticket.id)}
        />
      )}
    </Dialog>
  )
}
