import * as NodeServices from "@effect/platform-node/NodeServices"
import * as AcpClient from "@noyau/acp/client"
import type * as AcpSchema from "@noyau/acp/schema"
import { sanitizeThreadTitle } from "@noyau/protocol/thread/title"
import {
  type CursorAdapterOptions,
  resolveCursorExecutable,
} from "@noyau/server/provider/cursor-acp"
import { Effect, Layer, Option, Ref, Schema } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"

import {
  buildThreadTitlePrompt,
  extractJsonObject,
  type ThreadTitlePromptInput,
} from "./prompts.ts"
import {
  TextGeneration,
  TextGenerationError,
  type ThreadTitleGenerationInput,
} from "./text-generation.ts"

const ACP_VERSION = 1 as const
const CURSOR_AUTH_METHOD = "cursor_login"
const CURSOR_TIMEOUT_MS = 60_000
const ASK_MODE_ALIASES = ["ask"]
const TitleOutput = Schema.Struct({ title: Schema.String })
const decodeTitleOutput = Schema.decodeUnknownEffect(Schema.fromJsonString(TitleOutput))
const isTextGenerationError = Schema.is(TextGenerationError)

const generationError = (detail: string) =>
  new TextGenerationError({
    operation: "generateThreadTitle",
    detail,
  })

const modeSearchText = (mode: AcpSchema.SessionMode) =>
  `${mode.id} ${mode.name} ${mode.description ?? ""}`.toLowerCase()

const findAskMode = (modes: AcpSchema.SessionModeState | undefined) => {
  if (modes === undefined) {
    return undefined
  }
  for (const alias of ASK_MODE_ALIASES) {
    const exact = modes.availableModes.find(
      (mode) => mode.id.toLowerCase() === alias || mode.name.toLowerCase() === alias,
    )
    if (exact !== undefined) {
      return exact.id
    }
  }
  return modes.availableModes.find((mode) => modeSearchText(mode).includes("ask"))?.id
}

const autoApproval = (options: ReadonlyArray<AcpSchema.PermissionOption>) => {
  const selected =
    options.find((option) => option.kind === "allow_always") ??
    options.find((option) => option.kind === "allow_once")
  return selected === undefined
    ? { outcome: { outcome: "cancelled" as const } }
    : { outcome: { outcome: "selected" as const, optionId: selected.optionId } }
}

const makeCursorTextGeneration = Effect.fn("CursorTextGeneration.make")(function* (
  options: CursorAdapterOptions = {},
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const environment = options.environment ?? process.env
  const platform = options.platform ?? process.platform
  const configuredPath = options.binaryPath ?? environment.NOYAU_CURSOR_PATH
  const binaryArgs = options.binaryArgs ?? []
  const clientVersion = options.clientVersion ?? "0.0.0"
  const executable = yield* resolveCursorExecutable(configuredPath, environment, platform)

  const generateThreadTitle = Effect.fn("CursorTextGeneration.generateThreadTitle")(function* (
    input: ThreadTitleGenerationInput,
  ) {
    if (executable === null) {
      return yield* generationError("Cursor executable is not available for text generation")
    }

    const outputRef = yield* Ref.make("")
    const handle = yield* spawner
      .spawn(
        ChildProcess.make(executable, [...binaryArgs, "acp"], {
          cwd: input.cwd,
          env: environment,
          detached: false,
          windowsHide: true,
        }),
      )
      .pipe(Effect.mapError(() => generationError(`Failed to spawn Cursor ACP at ${executable}`)))
    const context = yield* Layer.build(AcpClient.layerChildProcess(handle))
    const acp = yield* Effect.service(AcpClient.AcpClient).pipe(Effect.provideContext(context))

    yield* acp.handleRequestPermission((request) => Effect.succeed(autoApproval(request.options)))
    yield* acp.handleSessionUpdate((notification) => {
      const update = notification.update
      if (update.sessionUpdate !== "agent_message_chunk") {
        return Effect.void
      }
      const content = update.content
      if (content.type !== "text") {
        return Effect.void
      }
      return Ref.update(outputRef, (current) => current + content.text)
    })

    const initialized = yield* acp.agent
      .initialize({
        protocolVersion: ACP_VERSION,
        clientCapabilities: {
          fs: { readTextFile: false, writeTextFile: false },
          terminal: false,
        },
        clientInfo: { name: "noyau-text", version: clientVersion },
      })
      .pipe(Effect.mapError(() => generationError("Cursor ACP initialize failed")))
    if (
      initialized.protocolVersion !== ACP_VERSION ||
      initialized.agentCapabilities?.loadSession !== true
    ) {
      return yield* generationError("Cursor ACP is missing protocol v1 or session/load capability")
    }
    yield* acp.agent
      .authenticate({ methodId: CURSOR_AUTH_METHOD })
      .pipe(Effect.mapError(() => generationError("Cursor ACP authenticate failed")))

    const created = yield* acp.agent
      .createSession({
        cwd: input.cwd,
        mcpServers: [],
      })
      .pipe(Effect.mapError(() => generationError("Cursor ACP session/new failed")))
    const askMode = findAskMode(created.modes ?? undefined)
    if (askMode !== undefined && askMode !== created.modes?.currentModeId) {
      yield* acp.agent
        .setSessionConfigOption({
          sessionId: created.sessionId,
          configId: "mode",
          value: askMode,
        })
        .pipe(Effect.ignore)
    }

    let promptInput: ThreadTitlePromptInput = { message: input.message }
    if (input.previousTitle !== undefined) {
      promptInput = Object.assign(promptInput, { previousTitle: input.previousTitle })
    }
    const prompt = buildThreadTitlePrompt(promptInput)
    const promptResult = yield* acp.agent
      .prompt({
        sessionId: created.sessionId,
        prompt: [{ type: "text", text: prompt }],
      })
      .pipe(
        Effect.timeoutOption(CURSOR_TIMEOUT_MS),
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.fail(generationError("Cursor Agent request timed out.")),
            onSome: (value) => Effect.succeed(value),
          }),
        ),
        Effect.mapError((cause) =>
          isTextGenerationError(cause) ? cause : generationError("Cursor ACP request failed."),
        ),
      )

    const rawResult = (yield* Ref.get(outputRef)).trim()
    if (rawResult.length === 0) {
      return yield* generationError(
        promptResult.stopReason === "cancelled"
          ? "Cursor ACP request was cancelled."
          : "Cursor Agent returned empty output.",
      )
    }

    const generated = yield* decodeTitleOutput(extractJsonObject(rawResult)).pipe(
      Effect.mapError(() => generationError("Cursor Agent returned invalid structured output.")),
    )
    return { title: sanitizeThreadTitle(generated.title) }
  })

  return TextGeneration.of({
    generateThreadTitle: (input) =>
      generateThreadTitle(input).pipe(
        Effect.mapError((cause) =>
          isTextGenerationError(cause)
            ? cause
            : generationError("Cursor ACP text generation failed."),
        ),
        Effect.scoped,
      ),
  })
})

export const cursorTextGenerationLayer = (options: CursorAdapterOptions = {}) =>
  Layer.effect(TextGeneration, makeCursorTextGeneration(options)).pipe(
    Layer.provide(NodeServices.layer),
  )
