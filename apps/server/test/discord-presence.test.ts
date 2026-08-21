import { assert, describe, it } from "@effect/vitest"
import { ProjectId, ThreadId } from "@noyau/protocol/ids"
import { activityFromFocus, TABLEAU_PRESENCE_STATE } from "@noyau/server/discord/activity"
import {
  DISCORD_APPLICATION_ID,
  discordIpcPath,
  encodeDiscordFrame,
} from "@noyau/server/discord/ipc"
import { DiscordPresence, makePresenceController } from "@noyau/server/discord/presence"
import { Effect, Ref, Schema } from "effect"

const projectId = Schema.decodeSync(ProjectId)("10000000-0000-4000-8000-000000000001")
const threadId = Schema.decodeSync(ThreadId)("20000000-0000-4000-8000-000000000001")
const projects = [{ id: projectId, name: "noyau" }]
const threads = [{ id: threadId, projectId, title: "Brancher le focus" }]

describe("Discord presence mapping", () => {
  it("montre le Project et Tableau, ou le titre du Thread", () => {
    assert.deepStrictEqual(activityFromFocus({ _tag: "tableau", projectId }, projects, threads), {
      details: "noyau",
      state: TABLEAU_PRESENCE_STATE,
    })
    assert.deepStrictEqual(
      activityFromFocus({ _tag: "thread", projectId, threadId }, projects, threads),
      { details: "noyau", state: "Brancher le focus" },
    )
  })

  it("clear si idle, Project absent, et retombe sur Tableau si le Thread a disparu", () => {
    assert.isNull(activityFromFocus({ _tag: "idle" }, projects, threads))
    assert.isNull(
      activityFromFocus(
        {
          _tag: "tableau",
          projectId: Schema.decodeSync(ProjectId)("10000000-0000-4000-8000-000000000099"),
        },
        projects,
        threads,
      ),
    )
    assert.deepStrictEqual(
      activityFromFocus(
        {
          _tag: "thread",
          projectId,
          threadId: Schema.decodeSync(ThreadId)("20000000-0000-4000-8000-000000000099"),
        },
        projects,
        threads,
      ),
      { details: "noyau", state: TABLEAU_PRESENCE_STATE },
    )
  })

  it("encode un frame IPC little-endian", () => {
    const frame = encodeDiscordFrame(1, {
      cmd: "SET_ACTIVITY",
      nonce: "1",
      args: {
        pid: 1,
        activity: {
          details: "noyau",
          state: "Tableau",
          instance: false,
          timestamps: { start: 1_700_000_000_000 },
        },
      },
    })
    assert.strictEqual(frame.readUInt32LE(0), 1)
    assert.strictEqual(frame.readUInt32LE(4), frame.length - 8)
    assert.strictEqual(JSON.parse(frame.subarray(8).toString("utf8")).cmd, "SET_ACTIVITY")
    assert.strictEqual(DISCORD_APPLICATION_ID, "1540445560736321627")
    assert.strictEqual(discordIpcPath(0, "darwin", "/tmp"), "/tmp/discord-ipc-0")
    assert.strictEqual(discordIpcPath(3, "win32", "/tmp"), "\\\\.\\pipe\\discord-ipc-3")
  })
})

describe("PresenceController", () => {
  it.effect("publie une activity puis clear, et déduplique l'identité", () =>
    Effect.gen(function* () {
      const published = yield* Ref.make<ReadonlyArray<string>>([])
      const controller = yield* makePresenceController().pipe(
        Effect.provideService(DiscordPresence, {
          publish: (activity) =>
            Ref.update(published, (current) => [
              ...current,
              activity === null ? "clear" : `${activity.details}|${activity.state}`,
            ]),
        }),
      )

      yield* controller.setIntent({
        enabled: true,
        focus: { _tag: "thread", projectId, threadId },
      })
      yield* controller.sync({ projects, threads })
      yield* controller.sync({ projects, threads })
      yield* controller.setIntent({
        enabled: true,
        focus: { _tag: "tableau", projectId },
      })
      yield* controller.sync({ projects, threads })
      yield* controller.setIntent({
        enabled: false,
        focus: { _tag: "tableau", projectId },
      })
      yield* controller.sync({ projects, threads })

      assert.deepStrictEqual(yield* Ref.get(published), [
        "noyau|Brancher le focus",
        "noyau|Tableau",
        "clear",
      ])
    }),
  )
})
