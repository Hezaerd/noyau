import { Effect, Layer, Logger } from "effect"

import { ServerConfig } from "./config"

/**
 * Logger opérateur + `tracerLogger` pour que les logs deviennent des span
 * events. Pretty en local, JSON en production. Pas d'export OTLP.
 */
export const loggerLayer = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* ServerConfig
    const consoleLogger =
      config.environment === "production" ? Logger.consoleJson : Logger.consolePretty()
    return Logger.layer([consoleLogger, Logger.tracerLogger])
  }),
)
