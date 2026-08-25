import type { TurnDiff } from "@noyau/protocol/entities/turn"
import { ChevronRightIcon, FileDiffIcon } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const fileName = (path: string): string => path.split("/").at(-1) ?? path

export function ThreadTurnDiffCard({
  turnDiff,
  onOpen,
}: {
  readonly turnDiff: TurnDiff
  readonly onOpen?: (filePath?: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const files = turnDiff.files
  const summary = useMemo(
    () =>
      files.reduce(
        (acc, file) => ({
          additions: acc.additions + file.additions,
          deletions: acc.deletions + file.deletions,
        }),
        { additions: 0, deletions: 0 },
      ),
    [files],
  )
  if (files.length === 0) {
    return null
  }

  return (
    <div className="mt-3 rounded-2xl border border-border/70 bg-secondary p-2 dark:border-transparent dark:bg-input/32">
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-accent/60"
          onClick={() => setExpanded((current) => !current)}
        >
          <ChevronRightIcon
            aria-hidden
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform",
              expanded && "rotate-90",
            )}
          />
          <span className="font-medium text-foreground text-xs leading-4">
            {files.length} fichier{files.length === 1 ? "" : "s"} modifié
            {files.length === 1 ? "" : "s"}
          </span>
          {summary.additions > 0 || summary.deletions > 0 ? (
            <span className="ml-1 font-mono text-[11px] tabular-nums">
              {summary.additions > 0 ? (
                <span className="text-emerald-600 dark:text-emerald-400">+{summary.additions}</span>
              ) : null}
              {summary.additions > 0 && summary.deletions > 0 ? " " : null}
              {summary.deletions > 0 ? (
                <span className="text-rose-600 dark:text-rose-400">−{summary.deletions}</span>
              ) : null}
            </span>
          ) : null}
        </button>
        {onOpen === undefined ? null : (
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label="Ouvrir le patch"
            className="mr-1"
            onClick={() => onOpen()}
          >
            <FileDiffIcon />
          </Button>
        )}
      </div>
      {expanded ? (
        <ul className="mt-1 space-y-0.5 px-2 pb-1">
          {files.map((file) => {
            const content = (
              <>
                <span className="min-w-0 truncate text-foreground/90">
                  {fileName(file.path)}
                  <span className="ml-1.5 text-muted-foreground">{file.path}</span>
                </span>
                <span className="shrink-0 font-mono text-[11px] tabular-nums">
                  {file.additions > 0 ? (
                    <span className="text-emerald-600 dark:text-emerald-400">
                      +{file.additions}
                    </span>
                  ) : null}
                  {file.additions > 0 && file.deletions > 0 ? " " : null}
                  {file.deletions > 0 ? (
                    <span className="text-rose-600 dark:text-rose-400">−{file.deletions}</span>
                  ) : null}
                </span>
              </>
            )
            return (
              <li key={file.path}>
                {onOpen === undefined ? (
                  <div
                    className="flex w-full min-w-0 items-baseline justify-between gap-3 rounded-lg py-0.5 text-xs"
                    title={file.path}
                  >
                    {content}
                  </div>
                ) : (
                  <button
                    type="button"
                    className="flex w-full min-w-0 items-baseline justify-between gap-3 rounded-lg py-0.5 text-left text-xs transition-colors hover:bg-accent/60"
                    title={file.path}
                    onClick={() => onOpen(file.path)}
                  >
                    {content}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
