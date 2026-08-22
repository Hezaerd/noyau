// @vitest-environment happy-dom

import { Effect } from "effect"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import { pickProjectFolder, pickProjectFolderEffect } from "../src/lib/project-folder"

afterEach(() => {
  Object.defineProperty(window, "noyauDesktop", {
    configurable: true,
    value: undefined,
  })
  vi.restoreAllMocks()
})

describe("pickProjectFolder", () => {
  it("invokes the Desktop bridge and omits an empty start directory", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const pickFolder = vi.fn().mockResolvedValue("/Users/moi/Projet")
        Object.defineProperty(window, "noyauDesktop", {
          configurable: true,
          value: { pickFolder },
        })

        const result = yield* Effect.promise(() => pickProjectFolder("  "))
        expect(result).toEqual({ ok: true, value: "/Users/moi/Projet" })
        expect(pickFolder).toHaveBeenCalledWith(undefined)
      }),
    ))

  it("passes a concrete start directory to the Desktop bridge", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const pickFolder = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(window, "noyauDesktop", {
          configurable: true,
          value: { pickFolder },
        })

        const result = yield* Effect.promise(() => pickProjectFolder("~/Developer"))
        expect(result).toEqual({ ok: true, value: undefined })
        expect(pickFolder).toHaveBeenCalledWith({ initialPath: "~/Developer" })
      }),
    ))

  it("fails when the Desktop bridge is missing", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const effectResult = yield* Effect.result(pickProjectFolderEffect("/tmp"))
        expect(effectResult._tag).toBe("Failure")

        const result = yield* Effect.promise(() => pickProjectFolder("/tmp"))
        expect(result.ok).toBe(false)
        if (result.ok) {
          return
        }
        expect(result.failure).toEqual({
          _tag: "InvalidInput",
          message: "Le sélecteur de dossier n’est disponible que dans Noyau Desktop.",
        })
      }),
    ))

  it("fails when the Desktop picker rejects", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        Object.defineProperty(window, "noyauDesktop", {
          configurable: true,
          value: { pickFolder: () => Promise.reject(new Error("dialog failed")) },
        })

        const result = yield* Effect.promise(() => pickProjectFolder(undefined))
        expect(result.ok).toBe(false)
        if (result.ok) {
          return
        }
        expect(result.failure).toEqual({
          _tag: "InvalidInput",
          message: "Impossible d’ouvrir le sélecteur de dossier.",
        })
      }),
    ))
})
