import type { TicketId } from "@noyau/protocol/ids"
import { Link } from "@tanstack/react-router"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select"

export interface ThreadTicketLink {
  readonly id: TicketId
  readonly title: string
}

export function ThreadTicketChips({
  projectId,
  tickets,
}: {
  readonly projectId: string
  readonly tickets: ReadonlyArray<ThreadTicketLink>
}) {
  if (tickets.length === 0) {
    return null
  }

  return (
    <div aria-label="Tickets liés au Thread" className="flex flex-wrap gap-1.5">
      {tickets.map((ticket) => (
        <Badge
          key={ticket.id}
          variant="secondary"
          size="sm"
          render={
            <Link
              to="/projects/$projectId/board"
              params={{ projectId }}
              search={{ ticket: ticket.id }}
              aria-label={`Ouvrir le Ticket ${ticket.title} dans le Tableau`}
            />
          }
        >
          <span className="max-w-48 truncate">{ticket.title}</span>
        </Badge>
      ))}
    </div>
  )
}

export function ThreadTicketLinkEditor({
  linkedTickets,
  linkableTickets,
  selection,
  onSelectionChange,
  onUnlink,
}: {
  readonly linkedTickets: ReadonlyArray<ThreadTicketLink>
  readonly linkableTickets: ReadonlyArray<ThreadTicketLink>
  readonly selection: string | null
  readonly onSelectionChange: (value: string | null) => void
  readonly onUnlink: (ticketId: TicketId) => void
}) {
  return (
    <section aria-labelledby="thread-tickets-title" className="rounded-2xl border p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="thread-tickets-title" className="text-sm font-medium">
          Tickets liés
        </h2>
        <Select
          items={linkableTickets.map((ticket) => ({
            value: ticket.id,
            label: ticket.title,
          }))}
          value={selection}
          onValueChange={(value) => onSelectionChange(value)}
          disabled={linkableTickets.length === 0}
        >
          <SelectTrigger size="sm" className="w-56" aria-label="Lier un ticket">
            <SelectValue
              placeholder={
                linkableTickets.length === 0 ? "Tous les tickets sont liés" : "Lier un ticket"
              }
            />
          </SelectTrigger>
          <SelectPopup>
            {linkableTickets.map((ticket) => (
              <SelectItem key={ticket.id} value={ticket.id}>
                {ticket.title}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      </div>
      {linkedTickets.length === 0 ? (
        <p className="text-xs text-muted-foreground">Aucun Ticket lié à ce Thread.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {linkedTickets.map((ticket) => (
            <li
              key={ticket.id}
              className="flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-xs"
            >
              <span>{ticket.title}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => onUnlink(ticket.id)}
                aria-label={`Délier le ticket ${ticket.title}`}
              >
                ×
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
