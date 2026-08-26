import {
  RpcBootstrap,
  type RpcBootstrapConfig,
  TechnicalReporter,
  type TechnicalReportAnnotations,
} from "@noyau/client-runtime/platform"
import type { RpcSession } from "@noyau/client-runtime/rpc"
import { Effect, Layer } from "effect"
import { AtomRegistry } from "effect/unstable/reactivity"

export interface RecordedTechnicalReport {
  readonly details: string
  readonly annotations: TechnicalReportAnnotations
}

export interface RecordingTechnicalReporter {
  readonly reports: Array<RecordedTechnicalReport>
  readonly layer: Layer.Layer<TechnicalReporter>
}

export const rpcBootstrapLayer = (config: RpcBootstrapConfig): Layer.Layer<RpcBootstrap> =>
  RpcBootstrap.layer(config)

export const makeRecordingTechnicalReporter = (): RecordingTechnicalReporter => {
  const reports: Array<RecordedTechnicalReport> = []
  return {
    reports,
    layer: Layer.succeed(TechnicalReporter)({
      report: (details, annotations) =>
        Effect.sync(() => {
          reports.push({ details, annotations })
        }),
    }),
  }
}

/**
 * Registry Atom neuf, sans React (`effect/unstable/reactivity`, pas
 * `@effect/atom-react`). Équivalent t3code : `AtomRegistry.make()`.
 */
export const makeTestRegistry = (): AtomRegistry.AtomRegistry => AtomRegistry.make()

export const makeFakeRpcSession = (
  generation: number,
  onDispose: () => void = () => undefined,
): RpcSession => {
  let disposed = false
  return {
    generation,
    get client(): RpcSession["client"] {
      throw new Error("fake RpcSession has no RPC client")
    },
    ready: Effect.void,
    closed: Effect.never,
    dispose: Effect.sync(() => {
      if (disposed) {
        return
      }
      disposed = true
      onDispose()
    }),
  }
}
