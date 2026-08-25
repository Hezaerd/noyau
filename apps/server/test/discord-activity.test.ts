import { WorkspaceRoot } from "@noyau/protocol/entities/environment"
import { ProjectId, ThreadId, TurnId } from "@noyau/protocol/ids"
import { ProjectCreated, ProjectMetaUpdated } from "@noyau/protocol/project/events"
import {
  ThreadMetaUpdated,
  ThreadTitleSeeded,
  ThreadTranscriptAppended,
} from "@noyau/protocol/thread/events"
import { journalEventTouchesPresence } from "@noyau/server/discord/activity"
import { Schema } from "effect"
import { describe, expect, it } from "vite-plus/test"

const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")
const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")

describe("journalEventTouchesPresence", () => {
  it("syncs on title and project name changes", () => {
    expect(
      journalEventTouchesPresence(ThreadTitleSeeded.make({ threadId, title: "Fix resume" })),
    ).toBe(true)
    expect(
      journalEventTouchesPresence(ThreadMetaUpdated.make({ threadId, title: "Titre manuel" })),
    ).toBe(true)
    expect(journalEventTouchesPresence(ThreadMetaUpdated.make({ threadId }))).toBe(false)
    expect(journalEventTouchesPresence(ProjectMetaUpdated.make({ projectId, name: "Noyau" }))).toBe(
      true,
    )
    expect(
      journalEventTouchesPresence(
        ProjectCreated.make({
          projectId,
          name: "Noyau",
          workspaceRoot: Schema.decodeSync(WorkspaceRoot)("/tmp/noyau"),
        }),
      ),
    ).toBe(true)
  })

  it("ignores streaming transcript", () => {
    expect(
      journalEventTouchesPresence(
        ThreadTranscriptAppended.make({
          item: {
            _tag: "transcript.assistant",
            threadId,
            turnId: TurnId.make("30000000-0000-4000-8000-000000000001"),
            text: "hello",
          },
        }),
      ),
    ).toBe(false)
  })
})
