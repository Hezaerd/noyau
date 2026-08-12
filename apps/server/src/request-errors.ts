import { InvalidRequest, RequestSchemaErrors } from "@noyau/protocol/control-plane"
import { Effect } from "effect"
import { HttpApiMiddleware } from "effect/unstable/httpapi"

/** Réponse publique stable pour toute erreur de décodage request HttpApi. */
export const requestSchemaErrorsLayer = HttpApiMiddleware.layerSchemaErrorTransform(
  RequestSchemaErrors,
  (error) => {
    switch (error.kind) {
      case "Params":
      case "Headers":
      case "Query":
      case "Payload":
        return Effect.fail(
          new InvalidRequest({
            reason: "Request does not match schema",
          }),
        )
      case "Body":
      case "ResponseHeaders":
        return Effect.die(error)
    }
  },
)
