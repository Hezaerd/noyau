import { ProjectId, ThreadId } from "@noyau/contracts/ids"
import { describe, expect, it } from "vite-plus/test"

import { resolveShellFocus } from "../src/lib/shell-focus"

const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")
const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")

describe("resolveShellFocus", () => {
  it("maps Tableau and Thread routes, and keeps Paramètres sticky", () => {
    expect(resolveShellFocus(`/projects/${projectId}/board`, undefined)).toEqual({
      _tag: "tableau",
      projectId,
    })
    expect(resolveShellFocus(`/projects/${projectId}/thread/${threadId}`, undefined)).toEqual({
      _tag: "thread",
      projectId,
      threadId,
    })
    expect(resolveShellFocus(`/projects/${projectId}/thread/new`, undefined)).toEqual({
      _tag: "tableau",
      projectId,
    })
    expect(resolveShellFocus("/settings/general", { _tag: "board", projectId })).toEqual({
      _tag: "sticky",
    })
  })

  it("uses the last screen on / and stays idle without one", () => {
    expect(resolveShellFocus("/", { _tag: "board", projectId })).toEqual({
      _tag: "tableau",
      projectId,
    })
    expect(resolveShellFocus("/", { _tag: "thread", projectId, threadId })).toEqual({
      _tag: "thread",
      projectId,
      threadId,
    })
    expect(resolveShellFocus("/", { _tag: "new-thread", projectId })).toEqual({
      _tag: "tableau",
      projectId,
    })
    expect(resolveShellFocus("/", undefined)).toEqual({ _tag: "idle" })
  })
})
