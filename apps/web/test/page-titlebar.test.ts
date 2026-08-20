import { ProjectId, ThreadId } from "@noyau/protocol/ids"
import { describe, expect, it } from "vite-plus/test"

import { NEW_THREAD_TITLE, resolvePageTitlebar } from "../src/lib/page-titlebar"

const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")
const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")

const projects = [{ id: projectId, name: "noyau" }]
const threads = [{ id: threadId, title: "Exclure les subtrees du graphe" }]

describe("page titlebar", () => {
  it("keeps Tableau and Control room as plain titles", () => {
    expect(resolvePageTitlebar({ pathname: "/", projects, threads })).toEqual({
      kind: "plain",
      title: "Tableau",
    })
    expect(
      resolvePageTitlebar({
        pathname: `/projects/${projectId}/board`,
        projects,
        threads,
      }),
    ).toEqual({ kind: "plain", title: "Tableau" })
    expect(resolvePageTitlebar({ pathname: "/unknown", projects, threads })).toEqual({
      kind: "plain",
      title: "Control room",
    })
  })

  it("resolves a Thread route to Project / Thread names", () => {
    expect(
      resolvePageTitlebar({
        pathname: `/projects/${projectId}/thread/${threadId}`,
        projects,
        threads,
      }),
    ).toEqual({
      kind: "thread",
      projectName: "noyau",
      threadTitle: "Exclure les subtrees du graphe",
    })
  })

  it("labels a new Thread and falls back when the shell is still empty", () => {
    expect(
      resolvePageTitlebar({
        pathname: `/projects/${projectId}/thread/new`,
        projects,
        threads,
      }),
    ).toEqual({
      kind: "thread",
      projectName: "noyau",
      threadTitle: NEW_THREAD_TITLE,
    })
    expect(
      resolvePageTitlebar({
        pathname: `/projects/${projectId}/thread/${threadId}`,
        projects: [],
        threads: [],
      }),
    ).toEqual({
      kind: "thread",
      projectName: undefined,
      threadTitle: "Thread",
    })
  })
})
