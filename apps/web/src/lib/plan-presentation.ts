export interface PlanStep {
  readonly completed: boolean
  readonly markdown: string
}

const TASK_LINE = /^\s*[-*+]\s+\[([ xX])\]\s+(.+?)\s*$/

/**
 * Recognizes the task-list shape emitted by provider plan updates. Richer plans
 * deliberately fall back to the normal markdown renderer so no prose is lost.
 */
export const parsePlanSteps = (markdown: string): ReadonlyArray<PlanStep> | null => {
  const steps: Array<PlanStep> = []
  let current: PlanStep | undefined

  for (const line of markdown.split("\n")) {
    const task = TASK_LINE.exec(line)
    if (task !== null) {
      current = {
        completed: task[1]?.toLowerCase() === "x",
        markdown: task[2] ?? "",
      }
      steps.push(current)
      continue
    }

    if (line.trim().length === 0) {
      continue
    }

    if (current === undefined) {
      return null
    }

    current = { ...current, markdown: `${current.markdown}\n${line.trim()}` }
    steps[steps.length - 1] = current
  }

  return steps.length === 0 ? null : steps
}
