import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { threadStatusNoticesVisible } from "@/lib/thread-transcript"

const interruptedLabel = "You stopped"

export function ThreadStatusNotices({
  session,
  latestTurn,
  onRetry,
}: {
  readonly session:
    | { readonly status: string; readonly lastError: string | null }
    | null
    | undefined
  readonly latestTurn: { readonly state: string } | null | undefined
  readonly onRetry?: (() => void) | undefined
}) {
  if (!threadStatusNoticesVisible(session, latestTurn)) {
    return null
  }

  return (
    <>
      {session?.status === "error" && session.lastError !== null ? (
        <Alert variant="error">
          <AlertTitle>Session error</AlertTitle>
          <AlertDescription>{session.lastError ?? ""}</AlertDescription>
          {onRetry === undefined ? null : (
            <AlertAction>
              <Button size="sm" variant="outline" onClick={onRetry}>
                Retry
              </Button>
            </AlertAction>
          )}
        </Alert>
      ) : null}
      {latestTurn?.state === "interrupted" ? (
        <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          {interruptedLabel} — the next message will start a new Turn.
        </div>
      ) : null}
    </>
  )
}
