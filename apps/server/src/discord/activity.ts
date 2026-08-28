import type { DomainEvent } from "@noyau/contracts/events"
import type { ProjectId, ThreadId } from "@noyau/contracts/ids"
import type { ShellFocus } from "@noyau/contracts/shell"

export interface PresenceActivity {
  readonly details: string
  readonly state: string
}

export interface PresenceProject {
  readonly id: ProjectId
  readonly name: string
}

export interface PresenceThread {
  readonly id: ThreadId
  readonly projectId: ProjectId
  readonly title: string
}

export const TABLEAU_PRESENCE_STATE = "Tableau"

export const activityFromFocus = (
  focus: ShellFocus,
  projects: ReadonlyArray<PresenceProject>,
  threads: ReadonlyArray<PresenceThread>,
): PresenceActivity | null => {
  switch (focus._tag) {
    case "idle":
      return null
    case "tableau": {
      const project = projects.find((candidate) => candidate.id === focus.projectId)
      return project === undefined ? null : { details: project.name, state: TABLEAU_PRESENCE_STATE }
    }
    case "thread": {
      const project = projects.find((candidate) => candidate.id === focus.projectId)
      if (project === undefined) {
        return null
      }
      const thread = threads.find((candidate) => candidate.id === focus.threadId)
      return thread === undefined
        ? { details: project.name, state: TABLEAU_PRESENCE_STATE }
        : { details: project.name, state: thread.title }
    }
  }
}

export const presenceIdentity = (activity: PresenceActivity | null): string =>
  activity === null ? "clear" : `${activity.details}\0${activity.state}`

/** Journal facts that can change Discord identity. Focus still syncs via setShellFocus. */
export const journalEventTouchesPresence = (event: DomainEvent): boolean => {
  switch (event._tag) {
    case "thread.title-seeded":
    case "thread.deleted":
    case "project.created":
    case "project.meta-updated":
    case "project.deleted":
      return true
    case "thread.meta-updated":
      return event.title !== undefined
    default:
      return false
  }
}
