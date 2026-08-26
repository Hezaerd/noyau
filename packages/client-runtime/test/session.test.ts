import { describe, expect, it } from "@effect/vitest"
import { classifyControlPlaneError, TransportRupture } from "@noyau/client-runtime/connection"
import { RpcBootstrap } from "@noyau/client-runtime/platform"
import {
  rpcSessionProtocolOptions,
  rpcSocketUrl,
  RpcSessionFactory,
} from "@noyau/client-runtime/rpc"
import { makeFakeRpcSession, rpcBootstrapLayer } from "@noyau/client-runtime/testing"
import { Forbidden, MissingIdentity, ServiceUnavailable } from "@noyau/protocol/errors"
import { GitCommandError } from "@noyau/protocol/git"
import { Effect, Layer } from "effect"
import { RpcClientDefect, RpcClientError } from "effect/unstable/rpc/RpcClientError"
import { Socket } from "effect/unstable/socket"

const fakeFactoryLayer = Layer.succeed(RpcSessionFactory)({
  connect: (generation) => Effect.succeed(makeFakeRpcSession(generation)),
})

describe("classifyControlPlaneError", () => {
  it("classe une rupture de transport et un RpcClientError hors défaut", () => {
    expect(classifyControlPlaneError(new TransportRupture({ reason: "ended" }))).toBe("transport")
    expect(classifyControlPlaneError(new TransportRupture({ reason: "failed" }))).toBe("transport")
    expect(
      classifyControlPlaneError(
        new RpcClientError({
          reason: new Socket.SocketCloseError({
            code: 1006,
            closeReason: "socket closed",
          }),
        }),
      ),
    ).toBe("transport")
  })

  it("classe Forbidden, MissingIdentity, ServiceUnavailable et GitCommandError comme métier", () => {
    expect(classifyControlPlaneError(new Forbidden())).toBe("business")
    expect(classifyControlPlaneError(new MissingIdentity())).toBe("business")
    expect(classifyControlPlaneError(new ServiceUnavailable({ service: "sqlite" }))).toBe(
      "business",
    )
    expect(
      classifyControlPlaneError(
        new GitCommandError({ operation: "status", detail: "not a git repository" }),
      ),
    ).toBe("business")
  })

  it("classe un RpcClientDefect et une valeur inconnue comme unexpected", () => {
    expect(
      classifyControlPlaneError(
        new RpcClientError({
          reason: new RpcClientDefect({
            message: "protocol defect",
            cause: new Error("decode"),
          }),
        }),
      ),
    ).toBe("unexpected")
    expect(classifyControlPlaneError(new Error("boom"))).toBe("unexpected")
  })
})

describe("RpcSessionFactory", () => {
  it("est un Context.Service", () => {
    expect(RpcSessionFactory).toBeTypeOf("function")
    expect(RpcSessionFactory.key).toBe("@noyau/client-runtime/rpc/session/RpcSessionFactory")
  })

  it("construit le protocol socket sans retry de transport", () => {
    expect(rpcSessionProtocolOptions.retryTransientErrors).toBe(false)
    expect(rpcSessionProtocolOptions.retryPolicy).toBeDefined()
  })

  it("ajoute le token de bootstrap à l'URL socket", () => {
    expect(
      rpcSocketUrl({
        rpcUrl: "ws://127.0.0.1:3001/rpc",
        bearerToken: "noyau-development-token",
      }),
    ).toBe("ws://127.0.0.1:3001/rpc?token=noyau-development-token")
  })
})

it.layer(
  Layer.merge(
    fakeFactoryLayer,
    rpcBootstrapLayer({ rpcUrl: "ws://127.0.0.1:9/rpc", bearerToken: "t" }),
  ),
)("RpcSessionFactory de test", (t) => {
  t.effect("connect enregistre la génération demandée", () =>
    Effect.gen(function* () {
      const factory = yield* RpcSessionFactory
      const bootstrap = yield* RpcBootstrap
      const session = yield* factory.connect(4)
      expect(session.generation).toBe(4)
      expect(bootstrap.rpcUrl).toBe("ws://127.0.0.1:9/rpc")
      yield* session.dispose
    }),
  )
})
