import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { assert, describe, it } from "@effect/vitest"
import { cursorTextGenerationLayer } from "@noyau/server/text-generation/cursor-text-generation"
import { buildThreadTitlePrompt, extractJsonObject } from "@noyau/server/text-generation/prompts"
import { TextGeneration } from "@noyau/server/text-generation/text-generation"
import { Effect, Layer } from "effect"

const fakeAgent = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "fake-cursor-acp.mjs")

describe("thread title prompts", () => {
  it("asks for a compact JSON title and does not copy the prompt", () => {
    const prompt = buildThreadTitlePrompt({
      message: "Please write a long plan and then implement the resume cursor",
    })
    assert.include(prompt, "Do not copy and truncate the user's message.")
    assert.include(prompt, "User message:")
    assert.include(prompt, "resume cursor")
  })

  it("keeps the previous title when regenerating", () => {
    const prompt = buildThreadTitlePrompt({
      message: "USER: Inspect\n\nASSISTANT: Found the bug",
      previousTitle: "Inspecte le projet",
    })
    assert.include(prompt, "Inspecte le projet")
    assert.include(prompt, "Thread contents:")
  })

  it("extracts a JSON object from surrounding prose", () => {
    assert.strictEqual(
      extractJsonObject('Sure.\n{"title":"Fix session resume"}\n'),
      '{"title":"Fix session resume"}',
    )
  })
})

describe("Cursor text generation", () => {
  it.effect("decodes a generated thread title from a Cursor ACP session", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const services = yield* Layer.build(
          cursorTextGenerationLayer({
            binaryPath: process.execPath,
            binaryArgs: [fakeAgent],
            environment: {
              ...process.env,
              PATH: "",
              NOYAU_FAKE_ACP_SCENARIO: "thread-title",
            },
            clientVersion: "test",
          }),
        )
        const textGeneration = yield* TextGeneration.pipe(Effect.provide(services))
        const generated = yield* textGeneration.generateThreadTitle({
          cwd: process.cwd(),
          message: "Inspecte le flux de reprise",
        })
        assert.strictEqual(generated.title, "Fix session resume")
      }),
    ),
  )
})
