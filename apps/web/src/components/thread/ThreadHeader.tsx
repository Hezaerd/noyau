import type { CursorProviderStatus } from "@noyau/protocol/entities/environment"
import type { RuntimeMode } from "@noyau/protocol/entities/runtime-mode"
import type { ProjectId } from "@noyau/protocol/ids"
import { Link } from "@tanstack/react-router"
import { ArrowLeftIcon, ListPlusIcon } from "lucide-react"

import { CursorReadinessChip } from "@/components/thread/CursorReadinessChip"
import { ThreadRuntimeModePicker } from "@/components/thread/ThreadRuntimeModePicker"
import { ThreadTicketChips, type ThreadTicketLink } from "@/components/thread/ThreadTicketLinks"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export interface ThreadHeaderProps {
  readonly projectId: ProjectId
  readonly projectName: string | undefined
  readonly title: string
  readonly provider: string
  readonly linkedTickets: ReadonlyArray<ThreadTicketLink>
  readonly cursor: CursorProviderStatus | undefined
  readonly runtimeMode: RuntimeMode
  readonly onRuntimeModeChange: (value: RuntimeMode) => void
  readonly canCreateTicket: boolean
  readonly onCreateTicket: () => void
}

export function ThreadHeader({
  projectId,
  projectName,
  title,
  provider,
  linkedTickets,
  cursor,
  runtimeMode,
  onRuntimeModeChange,
  canCreateTicket,
  onCreateTicket,
}: ThreadHeaderProps) {
  return (
    <header className="border-b border-border/65 bg-background/80 px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-2xl font-semibold tracking-[-0.04em]">{title}</h1>
            <Badge variant="outline">{provider}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {projectName ?? "Project"} · Conversation Cursor durable
          </p>
          <ThreadTicketChips projectId={projectId} tickets={linkedTickets} />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            render={
              <Link
                to="/projects/$projectId/board"
                params={{ projectId }}
                aria-label="Retour au Tableau"
              />
            }
            variant="outline"
            size="sm"
          >
            <ArrowLeftIcon data-icon="inline-start" />
            Tableau
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canCreateTicket}
            onClick={onCreateTicket}
          >
            <ListPlusIcon data-icon="inline-start" />
            Créer un Ticket
          </Button>
          <CursorReadinessChip status={cursor} />
          <ThreadRuntimeModePicker value={runtimeMode} onChange={onRuntimeModeChange} />
        </div>
      </div>
    </header>
  )
}
