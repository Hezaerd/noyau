import { readFile, rm } from "node:fs/promises"
import { fileURLToPath } from "node:url"

import { assert, describe, it } from "@effect/vitest"
import { cursorTextGenerationLayer } from "@noyau/server/text-generation/cursor-text-generation"
import {
  buildBranchNamePrompt,
  buildThreadTitlePrompt,
  extractJsonObject,
} from "@noyau/server/text-generation/prompts"
import { TextGeneration } from "@noyau/server/text-generation/text-generation"
import { Effect, Layer } from "effect"

const fakeAgent = fileURLToPath(new URL("./fixtures/fake-cursor-acp.mjs", import.meta.url))

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

  it("asks for a short JSON branch name", () => {
    const prompt = buildBranchNamePrompt({ message: "Add a safer reconnect backoff." })
    assert.include(prompt, "Return a JSON object with key: branch.")
    assert.include(prompt, "Add a safer reconnect backoff.")
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
            environment: { PATH: "", NOYAU_FAKE_ACP_SCENARIO: "thread-title" },
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

  it.effect("decodes a generated worktree branch name from a Cursor ACP session", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const services = yield* Layer.build(
          cursorTextGenerationLayer({
            binaryPath: process.execPath,
            binaryArgs: [fakeAgent],
            environment: { PATH: "", NOYAU_FAKE_ACP_SCENARIO: "branch-name" },
            clientVersion: "test",
          }),
        )
        const textGeneration = yield* TextGeneration.pipe(Effect.provide(services))
        const generated = yield* textGeneration.generateBranchName({
          cwd: process.cwd(),
          message: "Add a safer reconnect backoff.",
        })
        assert.strictEqual(generated.branch, "safer-reconnect-backoff")
      }),
    ),
  )

  it.effect("applies the configured model, effort, and service tier before prompting", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const requestLog = `${process.cwd()}/.noyau-text-generation-requests-${crypto.randomUUID()}.jsonl`
        yield* Effect.addFinalizer(() => Effect.promise(() => rm(requestLog, { force: true })))
        const services = yield* Layer.build(
          cursorTextGenerationLayer({
            binaryPath: process.execPath,
            binaryArgs: [fakeAgent],
            environment: {
              PATH: "",
              NOYAU_FAKE_ACP_SCENARIO: "thread-title",
              NOYAU_FAKE_ACP_REQUEST_LOG: requestLog,
            },
            clientVersion: "test",
            resolveModelSelection: () =>
              Effect.succeed({
                modelId: "composer-2.5-fast",
                reasoningEffort: "high",
                serviceTier: "fast",
              }),
          }),
        )
        const textGeneration = yield* TextGeneration.pipe(Effect.provide(services))
        yield* textGeneration.generateThreadTitle({ cwd: process.cwd(), message: "Fix it" })
        const requests = (yield* Effect.promise(() => readFile(requestLog, "utf8")))
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
        const configured = requests.filter(
          (request) =>
            request.method === "session/set_config_option" &&
            ["model", "effort", "service_tier"].includes(request.params.configId),
        )
        assert.deepStrictEqual(
          configured.map((request) => [request.params.configId, request.params.value]),
          [
            ["model", "composer-2.5-fast"],
            ["effort", "high"],
            ["service_tier", "fast"],
          ],
        )
        assert.isBelow(
          requests.findIndex((request) => request.method === "session/set_config_option"),
          requests.findIndex((request) => request.method === "session/prompt"),
        )
      }),
    ),
  )
})
