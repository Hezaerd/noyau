import { CircleAlertIcon, CircleCheckIcon, CircleDashedIcon } from "lucide-react"
import { useEffect, useState } from "react"

import {
  formatElapsedLabel,
  type ThreadActivity,
  type ThreadActivityKind,
} from "@/lib/thread-activity"
import { cn } from "@/lib/utils"

const statusClassName = {
  working: "text-sky-600 dark:text-sky-400",
  completed: "text-emerald-600 dark:text-emerald-400",
  interrupted: "text-muted-foreground",
  error: "text-destructive",
} as const satisfies Record<ThreadActivityKind, string>

function ThreadWorkingDuration({ startedAtMs }: { readonly startedAtMs: number }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => {
      setTick((tick) => tick + 1)
    }, 1_000)
    return () => {
      window.clearInterval(id)
    }
  }, [startedAtMs])
  return (
    <span aria-hidden className="font-mono tabular-nums">
      {formatElapsedLabel(Date.now() - startedAtMs)}
    </span>
  )
}

export function ThreadSidebarStatus({
  activity,
  startedAtMs,
}: {
  readonly activity: ThreadActivity
  readonly startedAtMs: number | null
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 text-[11px] font-medium",
        statusClassName[activity.kind],
        activity.kind === "working" && "opacity-80",
      )}
    >
      {activity.kind === "working" ? (
        <CircleDashedIcon aria-hidden className="size-3.5 shrink-0" />
      ) : activity.kind === "completed" ? (
        <CircleCheckIcon aria-hidden className="size-3.5 shrink-0" />
      ) : activity.kind === "error" ? (
        <CircleAlertIcon aria-hidden className="size-3.5 shrink-0" />
      ) : null}
      <span role="status">{activity.label}</span>
      {activity.kind === "working" && startedAtMs !== null ? (
        <ThreadWorkingDuration startedAtMs={startedAtMs} />
      ) : null}
    </span>
  )
}
