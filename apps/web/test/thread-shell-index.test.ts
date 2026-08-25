import { ProjectId, ThreadId } from "@noyau/protocol/ids"
import { ThreadShell } from "@noyau/protocol/shell"
import { Schema } from "effect"
import { describe, expect, it } from "vite-plus/test"

import { EMPTY_THREAD_SHELL_INDEX, indexThreadShells } from "../src/lib/thread-shell-index"

const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")
const otherProjectId = ProjectId.make("10000000-0000-4000-8000-000000000002")
const firstId = ThreadId.make("20000000-0000-4000-8000-000000000001")
const secondId = ThreadId.make("20000000-0000-4000-8000-000000000002")

const makeThread = (id: ThreadId, nextProjectId: ProjectId = projectId): ThreadShell =>
  Schema.decodeSync(ThreadShell)({
    id,
    projectId: nextProjectId,
    title: "Nouveau Thread",
    provider: "cursor",
    runtimeMode: "full-access",
    status: "active",
    latestTurn: null,
    sessionStatus: null,
    lastError: null,
    createdAt: "2026-08-25T12:00:00.000Z",
    updatedAt: "2026-08-25T12:00:00.000Z",
  })

describe("indexThreadShells", () => {
  it("reuses the project id list when only a Thread field changes", () => {
    const first = makeThread(firstId)
    const second = makeThread(secondId)
    const initial = indexThreadShells([first, second], EMPTY_THREAD_SHELL_INDEX)
    const updated = { ...first, title: "Renommé" }
    const next = indexThreadShells([updated, second], initial)

    expect(next.threadIdsByProjectId.get(projectId)).toBe(
      initial.threadIdsByProjectId.get(projectId),
    )
    expect(next.threadsById.get(firstId)).toBe(updated)
    expect(next.threadsById.get(secondId)).toBe(second)
    expect(next.threadsByProjectId.get(projectId)).not.toBe(
      initial.threadsByProjectId.get(projectId),
    )
    expect(next.threadsByProjectId.get(projectId)?.[1]).toBe(second)
  })

  it("returns the previous index when every Thread ref is unchanged", () => {
    const first = makeThread(firstId)
    const initial = indexThreadShells([first], EMPTY_THREAD_SHELL_INDEX)
    const next = indexThreadShells([first], initial)

    expect(next).toBe(initial)
  })

  it("isolates project lists so another Project's upsert leaves this list stable", () => {
    const local = makeThread(firstId)
    const remote = makeThread(secondId, otherProjectId)
    const initial = indexThreadShells([local, remote], EMPTY_THREAD_SHELL_INDEX)
    const updatedRemote = { ...remote, title: "Autre Project" }
    const next = indexThreadShells([local, updatedRemote], initial)

    expect(next.threadIdsByProjectId.get(projectId)).toBe(
      initial.threadIdsByProjectId.get(projectId),
    )
    expect(next.threadsByProjectId.get(projectId)).toBe(initial.threadsByProjectId.get(projectId))
    expect(next.threadsById.get(firstId)).toBe(local)
    expect(next.threadsById.get(secondId)).toBe(updatedRemote)
  })
})
