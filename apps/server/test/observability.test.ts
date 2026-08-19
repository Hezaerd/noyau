import { assert, describe, layer } from "@effect/vitest"
import { ServerConfig, type ServerConfigValue } from "@noyau/server/config"
import { loggerLayer } from "@noyau/server/observability"
import { Effect, Layer, Redacted, Tracer } from "effect"

const config = (environment: ServerConfigValue["environment"]): ServerConfigValue => ({
  environment,
  databaseUrl: Redacted.make("postgresql://unused"),
  host: "127.0.0.1",
  port: 3001,
  eventPollInterval: 1,
  devActorId: "human:hezaerd",
})

const LoggerLayer = loggerLayer.pipe(
  Layer.provide(Layer.succeed(ServerConfig)(config("development"))),
)

describe("server logger", () => {
  layer(LoggerLayer)((it) => {
    it.effect("attache les logs au span courant via tracerLogger", () =>
      Effect.gen(function* () {
        const events: Array<string> = []
        const tracer = Tracer.make({
          span: (options) => {
            const span = new Tracer.NativeSpan(options)
            const event = span.event.bind(span)
            span.event = (name, startTime, attributes) => {
              events.push(name)
              event(name, startTime, attributes)
            }
            return span
          },
        })

        yield* Effect.logInfo("Migrations completed").pipe(
          Effect.withSpan("server.migrations"),
          Effect.withTracer(tracer),
        )

        assert.ok(events.includes("Migrations completed"))
      }),
    )
  })
})
