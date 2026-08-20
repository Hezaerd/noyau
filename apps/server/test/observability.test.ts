import { assert, describe, layer } from "@effect/vitest"
import { loggerLayer } from "@noyau/server/observability"
import { Effect, Layer, Tracer } from "effect"

import { testServerConfigLayer } from "./fixtures"

const LoggerLayer = loggerLayer.pipe(
  Layer.provide(testServerConfigLayer({ environment: "development" })),
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
