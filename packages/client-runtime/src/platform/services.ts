import { Context, type Effect, Layer } from "effect"
import { Socket } from "effect/unstable/socket"

/**
 * Bootstrap RPC fourni par `apps/web`. Ce package ne construit pas le transport.
 */
export interface RpcBootstrapConfig {
  readonly rpcUrl: string
  readonly bearerToken: string
}

export class RpcBootstrap extends Context.Service<RpcBootstrap, RpcBootstrapConfig>()(
  "@noyau/client-runtime/platform/RpcBootstrap",
) {
  static layer(config: RpcBootstrapConfig): Layer.Layer<RpcBootstrap> {
    return Layer.succeed(RpcBootstrap)(config)
  }
}

/**
 * Constructeur WebSocket d'Effect (`effect/unstable/socket`). Pas une seconde pile.
 * L'implémentation concrète est fournie par `apps/web` (ou un Layer de test).
 */
export const WebSocketConstructor: typeof Socket.WebSocketConstructor = Socket.WebSocketConstructor

export interface TechnicalReportAnnotations {
  readonly incidentId: string
  readonly source: string
}

export interface TechnicalReporterService {
  readonly report: (details: string, annotations: TechnicalReportAnnotations) => Effect.Effect<void>
}

/**
 * Journalisation technique de présentation. L'implémentation vit dans `apps/web`.
 */
export class TechnicalReporter extends Context.Service<
  TechnicalReporter,
  TechnicalReporterService
>()("@noyau/client-runtime/platform/TechnicalReporter") {}
