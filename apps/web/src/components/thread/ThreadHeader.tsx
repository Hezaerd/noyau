import type { CursorProviderStatus } from "@noyau/protocol/entities/environment"
import type { RuntimeMode } from "@noyau/protocol/entities/runtime-mode"
import type { ProjectId } from "@noyau/protocol/ids"
import { Link } from "@tanstack/react-router"
import { ArrowLeftIcon, ListPlusIcon } from "lucide-react"

import { CursorReadinessChip } from "@/components/thread/CursorReadinessChip"
import { ThreadRuntimeModePicker } from "@/components/thread/ThreadRuntimeModePicker"
import { Button } from "@/components/ui/button"

export interface ThreadHeaderProps {
  readonly projectId: ProjectId
  readonly cursor: CursorProviderStatus | undefined
  readonly runtimeMode: RuntimeMode
  readonly onRuntimeModeChange: (value: RuntimeMode) => void
  readonly canCreateTicket: boolean
  readonly onCreateTicket: () => void
}

export function ThreadHeader({
  projectId,
  cursor,
  runtimeMode,
  onRuntimeModeChange,
  canCreateTicket,
  onCreateTicket,
}: ThreadHeaderProps) {
  return (
    <header className="border-b border-border/65 bg-background/80 px-4 py-3 sm:px-6">
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
    </header>
  )
}
