import { CommandId, ProjectId } from "@noyau/contracts/ids"
import { Crypto, Effect } from "effect"
import { describe, expect, it } from "vite-plus/test"

import { makeProjectDeleteRequest } from "../src/lib/project-commands"
import {
  destinationAfterProjectRemoval,
  isViewingProject,
  nextLastProjectId,
} from "../src/lib/project-navigation"

const crypto = Crypto.make({
  randomBytes: (size) => new Uint8Array(size),
  digest: () => Effect.succeed(new Uint8Array()),
})

const ids = {
  first: ProjectId.make("10000000-0000-4000-8000-000000000001"),
  second: ProjectId.make("10000000-0000-4000-8000-000000000002"),
}

const runBuilder = <A, E>(builder: Effect.Effect<A, E, Crypto.Crypto>): A =>
  Effect.runSync(builder.pipe(Effect.provideService(Crypto.Crypto, crypto)))

describe("project deletion", () => {
  it("builds the delete command", () => {
    const request = runBuilder(makeProjectDeleteRequest({ projectId: ids.first }))
    expect(request._tag).toBe("project.delete")
    expect(request.payload.projectId).toBe(ids.first)
    expect(CommandId.make(request.commandId)).toBe(request.commandId)
  })

  it("keeps the last Project when it still exists", () => {
    expect(nextLastProjectId([{ id: ids.first }, { id: ids.second }], ids.second)).toBe(ids.second)
  })

  it("falls back to the first remaining Project, or none", () => {
    expect(nextLastProjectId([{ id: ids.second }], ids.first)).toBe(ids.second)
    expect(nextLastProjectId([], ids.first)).toBeUndefined()
  })

  it("routes to the next Board or home after removal", () => {
    expect(destinationAfterProjectRemoval([{ id: ids.second }])).toEqual({
      to: "/projects/$projectId/board",
      projectId: ids.second,
    })
    expect(destinationAfterProjectRemoval([])).toEqual({ to: "/" })
  })

  it("detects the current Project route", () => {
    expect(isViewingProject(`/projects/${ids.first}/board`, ids.first)).toBe(true)
    expect(isViewingProject(`/projects/${ids.first}/thread/new`, ids.first)).toBe(true)
    expect(isViewingProject(`/projects/${ids.second}/board`, ids.first)).toBe(false)
    expect(isViewingProject("/settings/appearance", ids.first)).toBe(false)
  })
})
