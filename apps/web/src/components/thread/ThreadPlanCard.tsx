import type { ProjectId } from "@noyau/contracts/ids"
import { CheckIcon, ListChecksIcon } from "lucide-react"

import { ThreadMarkdown } from "@/components/thread/ThreadMarkdown"
import { Progress, ProgressIndicator, ProgressTrack } from "@/components/ui/progress"
import { parsePlanSteps } from "@/lib/plan-presentation"
import { cn } from "@/lib/utils"

export function ThreadPlanCard({
  markdown,
  active,
  workspaceRoot,
  projectId,
}: {
  readonly markdown: string
  readonly active: boolean
  readonly workspaceRoot?: string | undefined
  readonly projectId?: ProjectId | undefined
}) {
  const steps = parsePlanSteps(markdown)
  const completed = steps?.filter((step) => step.completed).length ?? 0
  const total = steps?.length ?? 0
  const percentage = total === 0 ? 0 : Math.round((completed / total) * 100)
  const activeIndex = active ? steps?.findIndex((step) => !step.completed) : -1
  const finished = total > 0 && completed === total

  return (
    <section
      aria-label="Plan"
      className="w-full overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm/5"
    >
      <header className="flex items-center gap-3 border-b border-border/60 px-4 py-3.5">
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-lg",
            finished
              ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
              : "bg-primary/10 text-primary",
          )}
        >
          {finished ? (
            <CheckIcon aria-hidden className="size-4.5" strokeWidth={2.5} />
          ) : (
            <ListChecksIcon aria-hidden className="size-4.5" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground">
            {finished ? "Plan complete" : "Plan"}
          </h2>
          <p className="text-xs text-muted-foreground">
            {steps === null
              ? "Proposed approach"
              : total === 1
                ? `${completed} of 1 step complete`
                : `${completed} of ${String(total)} steps complete`}
          </p>
        </div>
        {!active || finished ? null : (
          <span className="rounded-full bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary">
            In progress
          </span>
        )}
      </header>

      {steps === null ? (
        <div className="px-4 py-3.5">
          <ThreadMarkdown text={markdown} workspaceRoot={workspaceRoot} projectId={projectId} />
        </div>
      ) : (
        <>
          <Progress
            aria-label={`${String(completed)} of ${String(total)} plan steps complete`}
            value={percentage}
            className="gap-0"
          >
            <ProgressTrack className="h-1 rounded-none bg-muted">
              <ProgressIndicator className={cn(finished && "bg-emerald-500 dark:bg-emerald-400")} />
            </ProgressTrack>
          </Progress>
          <ol className="divide-y divide-border/50">
            {steps.map((step, index) => {
              const isActive = index === activeIndex
              return (
                <li
                  key={`${String(index)}-${step.markdown}`}
                  className={cn(
                    "grid grid-cols-[2rem_minmax(0,1fr)] gap-2 px-4 py-3",
                    isActive && "bg-primary/[0.035]",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "mt-0.5 grid size-5 place-items-center self-start rounded-full border text-[10px] font-semibold tabular-nums",
                      step.completed
                        ? "border-emerald-500/30 bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
                        : isActive
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border bg-muted/40 text-muted-foreground",
                    )}
                  >
                    {step.completed ? (
                      <CheckIcon className="size-3" strokeWidth={2.75} />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <div className="min-w-0">
                    <div
                      className={cn(
                        "[&_.thread-markdown]:leading-5",
                        step.completed && "text-muted-foreground [&_.thread-markdown]:line-through",
                      )}
                    >
                      <ThreadMarkdown
                        text={step.markdown}
                        workspaceRoot={workspaceRoot}
                        projectId={projectId}
                      />
                    </div>
                    {!isActive ? null : (
                      <span className="mt-1 block text-[11px] font-medium text-primary">
                        In progress
                      </span>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        </>
      )}
    </section>
  )
}
