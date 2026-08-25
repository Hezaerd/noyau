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
          <AlertTitle>Erreur de Session</AlertTitle>
          <AlertDescription>{session.lastError ?? ""}</AlertDescription>
          {onRetry === undefined ? null : (
            <AlertAction>
              <Button size="sm" variant="outline" onClick={onRetry}>
                Réessayer
              </Button>
            </AlertAction>
          )}
        </Alert>
      ) : null}
      {latestTurn?.state === "interrupted" ? (
        <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          {interruptedLabel} — le prochain message démarrera un nouveau Turn.
        </div>
      ) : null}
    </>
  )
}
