const interruptedLabel = "You stopped"

export function ThreadStatusNotices({
  session,
  latestTurn,
}: {
  readonly session:
    | { readonly status: string; readonly lastError: string | null }
    | null
    | undefined
  readonly latestTurn: { readonly state: string } | null | undefined
}) {
  return (
    <>
      {session?.status === "error" && session.lastError !== null ? (
        <div role="alert" className="rounded-xl border border-destructive/35 bg-destructive/10 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-destructive">
            Session error
          </p>
          <p className="mt-1 text-sm">{session.lastError}</p>
        </div>
      ) : null}
      {latestTurn?.state === "interrupted" ? (
        <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          {interruptedLabel} — le prochain message démarrera un nouveau Turn.
        </div>
      ) : null}
    </>
  )
}
