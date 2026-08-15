import * as PgClient from "@effect/sql-pg/PgClient"
import { assert, layer } from "@effect/vitest"
import {
  executeBoardInitialize,
  executeTicketCommandRequest,
  readProjectBoardSnapshot,
} from "@noyau/database/board/store"
import { migrationsLayer } from "@noyau/database/migrations"
import {
  ActorId,
  CommandId,
  KanbanColumnId,
  ProjectId,
  ThreadId,
  TicketId,
} from "@noyau/protocol/ids"
import { TicketCreateRequest } from "@noyau/protocol/ticket/commands"
import { ServerConfig, type ServerConfigValue } from "@noyau/server/config"
import { serverRoutesLayer } from "@noyau/server/server"
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql"
import { Crypto, Effect, Layer, ManagedRuntime, Redacted } from "effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { afterAll, beforeAll } from "vite-plus/test"

let container: StartedPostgreSqlContainer

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:17-alpine").start()
})

afterAll(async () => {
  await container?.stop()
})

const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")
const actorId = ActorId.make("human:integration")
const backlogColumnId = KanbanColumnId.make("20000000-0000-4000-8000-000000000001")
const activeColumnId = KanbanColumnId.make("20000000-0000-4000-8000-000000000002")
const doneColumnId = KanbanColumnId.make("20000000-0000-4000-8000-000000000003")

const testCrypto = () => {
  let counter = 0
  return Crypto.make({
    randomBytes: (size) => {
      const bytes = new Uint8Array(size)
      counter += 1
      bytes[size - 1] = counter % 256
      bytes[size - 2] = (counter >> 8) % 256
      return bytes
    },
    digest: (_algorithm, data) => Effect.succeed(data),
  })
}

const databaseLayer = () =>
  Layer.unwrap(
    Effect.sync(() => {
      const config = {
        environment: "test",
        databaseUrl: Redacted.make(container.getConnectionUri()),
        host: "127.0.0.1",
        port: 0,
        eventPollInterval: 1,
        devActorId: actorId,
      } satisfies ServerConfigValue
      const postgres = PgClient.layer({
        url: config.databaseUrl,
        maxConnections: 10,
      })
      return Layer.mergeAll(
        migrationsLayer,
        Layer.succeed(Crypto.Crypto)(testCrypto()),
        Layer.succeed(ServerConfig)(config),
      ).pipe(Layer.provideMerge(postgres))
    }),
  )

layer(databaseLayer(), { timeout: "120 seconds" })((it) => {
  it.effect("persists board commands on PostgreSQL", () =>
    Effect.gen(function* () {
      yield* executeBoardInitialize({
        commandId: CommandId.make("30000000-0000-4000-8000-000000000001"),
        projectId,
        actorId,
        backlogColumnId,
        activeColumnId,
        doneColumnId,
      })

      const request = TicketCreateRequest.make({
        commandId: CommandId.make("30000000-0000-4000-8000-000000000002"),
        payload: {
          ticketId: TicketId.make("40000000-0000-4000-8000-000000000001"),
          workbenchThreadId: ThreadId.make("50000000-0000-4000-8000-000000000001"),
          title: "PostgreSQL Ticket",
          placement: { columnId: backlogColumnId },
        },
      })
      const receipt = yield* executeTicketCommandRequest({ request, projectId, actorId })
      const retry = yield* executeTicketCommandRequest({ request, projectId, actorId })
      const snapshot = yield* readProjectBoardSnapshot(projectId)

      assert.deepStrictEqual(retry, receipt)
      assert.strictEqual(receipt.response._tag, "accepted")
      assert.deepStrictEqual(
        snapshot.tickets.map((ticket) => ticket.title),
        ["PostgreSQL Ticket"],
      )
    }),
  )

  it("serves probes and no legacy Task endpoint", async () => {
    const webLayer = serverRoutesLayer.pipe(
      Layer.provide(HttpServer.layerServices),
      Layer.provide(databaseLayer()),
    )
    const { dispose, handler } = HttpRouter.toWebHandler(webLayer, {
      disableLogger: true,
    })
    const runtime = ManagedRuntime.make(databaseLayer())
    const context = await runtime.context()

    try {
      const [live, ready, legacy] = await Promise.all([
        handler(new Request("http://localhost/health/live"), context),
        handler(new Request("http://localhost/health/ready"), context),
        handler(new Request(`http://localhost/api/v1/projects/${projectId}/tasks`), context),
      ])
      assert.strictEqual(live.status, 200)
      assert.strictEqual(ready.status, 200)
      assert.strictEqual(legacy.status, 404)
    } finally {
      await dispose()
      await runtime.dispose()
    }
  })
})
