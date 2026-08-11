import type { TaskEvent } from "@noyau/protocol/events"

import type { TaskState } from "./decider"

/**
 * Projecteur pur : reconstruit l'état de décision d'une tâche depuis le
 * journal d'événements. Un événement sur un état absent est ignoré — le
 * journal fait foi, la projection reste totale.
 */
export const evolve = (state: TaskState | undefined, event: TaskEvent): TaskState | undefined => {
  switch (event._tag) {
    case "task.created":
      return { taskId: event.taskId, status: "proposed" }
    case "task.assigned":
      return state === undefined ? undefined : { ...state, assigneeId: event.assigneeId }
    case "task.completed":
      return state === undefined ? undefined : { ...state, status: "completed" }
    case "task.failed":
      return state === undefined ? undefined : { ...state, status: "failed" }
  }
}

export const replay = (events: Iterable<TaskEvent>): TaskState | undefined => {
  let state: TaskState | undefined = undefined
  for (const event of events) {
    state = evolve(state, event)
  }
  return state
}
