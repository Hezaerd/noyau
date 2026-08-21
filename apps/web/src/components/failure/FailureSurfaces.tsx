import { CircleAlertIcon, RefreshCwIcon } from "lucide-react"
import type { ReactElement } from "react"

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import type { FailurePresentation } from "@/lib/failure-presentation"
import { cn } from "@/lib/utils"

type RecoveryProps = {
  readonly onRecovery?: () => void
  readonly presentation: FailurePresentation
}

export function InlineFailure({
  className,
  id,
  presentation,
}: {
  readonly className?: string
  readonly id?: string
  readonly presentation: FailurePresentation
}): ReactElement | null {
  if (presentation.surface === "silent") return null
  return (
    <p id={id} role="alert" className={cn("text-sm text-destructive", className)}>
      {presentation.title}
      {presentation.description === undefined ? null : ` ${presentation.description}`}
    </p>
  )
}

export function ScopeBanner({ presentation, onRecovery }: RecoveryProps): ReactElement | null {
  if (presentation.surface === "silent") return null
  return (
    <Alert
      variant={presentation.tone === "critical" ? "error" : "warning"}
      className="rounded-none border-x-0 border-t-0"
    >
      <CircleAlertIcon />
      <AlertTitle>{presentation.title}</AlertTitle>
      {presentation.description === undefined ? null : (
        <AlertDescription>{presentation.description}</AlertDescription>
      )}
      {presentation.recovery === undefined || onRecovery === undefined ? null : (
        <AlertAction>
          <Button type="button" size="xs" variant="ghost" onClick={onRecovery}>
            <RefreshCwIcon aria-hidden="true" />
            {presentation.recovery.label}
          </Button>
        </AlertAction>
      )}
    </Alert>
  )
}

export function ResourceErrorState({ presentation, onRecovery }: RecoveryProps): ReactElement {
  return (
    <main className="flex min-h-0 flex-1 items-center justify-center px-6 py-16">
      <div className="flex max-w-sm flex-col items-center text-center">
        <div className="mb-5 grid size-10 place-items-center rounded-lg border bg-card text-destructive shadow-sm/5">
          <CircleAlertIcon aria-hidden="true" />
        </div>
        <h2 className="font-heading text-xl font-semibold">{presentation.title}</h2>
        {presentation.description === undefined ? null : (
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{presentation.description}</p>
        )}
        {presentation.recovery === undefined || onRecovery === undefined ? null : (
          <Button type="button" className="mt-6" onClick={onRecovery}>
            <RefreshCwIcon aria-hidden="true" />
            {presentation.recovery.label}
          </Button>
        )}
      </div>
    </main>
  )
}
