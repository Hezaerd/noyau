import * as NodeServices from "@effect/platform-node/NodeServices"
import * as AcpClient from "@noyau/acp/client"
import type * as AcpSchema from "@noyau/acp/schema"
import type { ModelSelection } from "@noyau/contracts/entities/model-selection"
import { sanitizeThreadTitle } from "@noyau/contracts/thread/title"
import {
  booleanSelectValue,
  type CursorAdapterOptions,
  fastOption,
  reasoningOption,
  resolveCursorExecutable,
  selectOptions,
  serviceTierOption,
} from "@noyau/server/provider/cursor-acp"
import { Effect, FileSystem, Layer, Option, Path, Ref, Schema } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"

import {
  buildBranchNamePrompt,
  buildGitDraftPrompt,
  buildThreadTitlePrompt,
  extractJsonObject,
  type ThreadTitlePromptInput,
} from "./prompts.ts"
import {
  TextGeneration,
  TextGenerationError,
  type BranchNameGenerationInput,
  type GitDraftGenerationInput,
  type ThreadTitleGenerationInput,
} from "./text-generation.ts"

const ACP_VERSION = 1 as const
const CURSOR_AUTH_METHOD = "cursor_login"
const CURSOR_TIMEOUT_MS = 60_000
const ASK_MODE_ALIASES = ["ask"]
const TitleOutput = Schema.Struct({ title: Schema.String })
const BranchOutput = Schema.Struct({ branch: Schema.String })
const DraftOutput = Schema.Struct({
  title: Schema.String,
  body: Schema.optionalKey(Schema.String),
})
const decodeTitleOutput = Schema.decodeUnknownEffect(Schema.fromJsonString(TitleOutput))
const decodeBranchOutput = Schema.decodeUnknownEffect(Schema.fromJsonString(BranchOutput))
const decodeDraftOutput = Schema.decodeUnknownEffect(Schema.fromJsonString(DraftOutput))
const isTextGenerationError = Schema.is(TextGenerationError)

const generationError = (operation: TextGenerationError["operation"], detail: string) =>
  new TextGenerationError({
    operation,
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

export interface CursorTextGenerationOptions extends CursorAdapterOptions {
  readonly resolveModelSelection?: () => Effect.Effect<
    ModelSelection | null,
    never,
    FileSystem.FileSystem | Path.Path
  >
}

const makeCursorTextGeneration = Effect.fn("CursorTextGeneration.make")(function* (
  options: CursorTextGenerationOptions = {},
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const environment = options.environment ?? process.env
  const platform = options.platform ?? process.platform
  const configuredPath = options.binaryPath ?? environment.NOYAU_CURSOR_PATH
  const binaryArgs = options.binaryArgs ?? []
  const clientVersion = options.clientVersion ?? "0.0.0"
  const executable = yield* resolveCursorExecutable(configuredPath, environment, platform)

  const promptRaw = Effect.fn("CursorTextGeneration.promptRaw")(function* (
    operation: TextGenerationError["operation"],
    cwd: string,
    prompt: string,
  ) {
    const fail = (detail: string) => generationError(operation, detail)
    if (executable === null) {
      return yield* fail("Cursor executable is not available for text generation")
    }

    const outputRef = yield* Ref.make("")
    const handle = yield* spawner
      .spawn(
        ChildProcess.make(executable, [...binaryArgs, "acp"], {
          cwd,
          env: environment,
          detached: false,
          windowsHide: true,
        }),
      )
      .pipe(Effect.mapError(() => fail(`Failed to spawn Cursor ACP at ${executable}`)))
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
      .pipe(Effect.mapError(() => fail("Cursor ACP initialize failed")))
    if (
      initialized.protocolVersion !== ACP_VERSION ||
      initialized.agentCapabilities?.loadSession !== true
    ) {
      return yield* fail("Cursor ACP is missing protocol v1 or session/load capability")
    }
    yield* acp.agent
      .authenticate({ methodId: CURSOR_AUTH_METHOD })
      .pipe(Effect.mapError(() => fail("Cursor ACP authenticate failed")))

    const created = yield* acp.agent
      .createSession({
        cwd,
        mcpServers: [],
      })
      .pipe(Effect.mapError(() => fail("Cursor ACP session/new failed")))
    const selection = yield* (
      options
        .resolveModelSelection?.()
        .pipe(
          Effect.provideService(FileSystem.FileSystem, fileSystem),
          Effect.provideService(Path.Path, path),
        ) ?? Effect.succeed(null)
    )
    if (selection !== null) {
      let configOptions = created.configOptions ?? []
      const modelOption = configOptions.find((option) => option.category === "model")
      const advertisedModel = selectOptions(modelOption).find(
        (option) => option.value === selection.modelId,
      )
      if (modelOption?.type === "select" && advertisedModel !== undefined) {
        configOptions = (yield* acp.agent.setSessionConfigOption({
          sessionId: created.sessionId,
          configId: modelOption.id,
          value: advertisedModel.value,
        })).configOptions
      } else if (
        created.models?.availableModels.some((model) => model.modelId === selection.modelId) ===
        true
      ) {
        yield* acp.agent.setSessionModel({
          sessionId: created.sessionId,
          modelId: selection.modelId,
        })
      } else {
        return yield* fail(`Cursor model is unavailable: ${selection.modelId}`)
      }
      if (selection.reasoningEffort !== undefined) {
        const option = reasoningOption(configOptions)
        const advertised = selectOptions(option).find(
          (entry) => entry.value === selection.reasoningEffort,
        )
        if (option?.type !== "select" || advertised === undefined) {
          return yield* fail(`Cursor reasoning effort is unavailable: ${selection.reasoningEffort}`)
        }
        configOptions = (yield* acp.agent.setSessionConfigOption({
          sessionId: created.sessionId,
          configId: option.id,
          value: advertised.value,
        })).configOptions
      }
      if (selection.serviceTier !== undefined) {
        const tier = serviceTierOption(configOptions)
        const advertised = selectOptions(tier).find(
          (entry) => entry.value === selection.serviceTier,
        )
        const fast = fastOption(configOptions)
        const response =
          tier?.type === "select" && advertised !== undefined
            ? yield* acp.agent.setSessionConfigOption({
                sessionId: created.sessionId,
                configId: tier.id,
                value: advertised.value,
              })
            : fast?.type === "boolean" &&
                ["standard", "normal", "fast"].includes(selection.serviceTier)
              ? yield* acp.agent.setSessionConfigOption({
                  sessionId: created.sessionId,
                  configId: fast.id,
                  type: "boolean",
                  value: selection.serviceTier === "fast",
                })
              : fast?.type === "select" &&
                  ["standard", "normal", "fast"].includes(selection.serviceTier)
                ? yield* acp.agent.setSessionConfigOption({
                    sessionId: created.sessionId,
                    configId: fast.id,
                    value:
                      booleanSelectValue(fast, selection.serviceTier === "fast") ??
                      selection.serviceTier,
                  })
                : undefined
        if (response === undefined) {
          return yield* fail(`Cursor service tier is unavailable: ${selection.serviceTier}`)
        }
      }
    }
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

    const promptResult = yield* acp.agent
      .prompt({
        sessionId: created.sessionId,
        prompt: [{ type: "text", text: prompt }],
      })
      .pipe(
        Effect.timeoutOption(CURSOR_TIMEOUT_MS),
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.fail(fail("Cursor Agent request timed out.")),
            onSome: (value) => Effect.succeed(value),
          }),
        ),
        Effect.mapError((cause) =>
          isTextGenerationError(cause) ? cause : fail("Cursor ACP request failed."),
        ),
      )

    const rawResult = (yield* Ref.get(outputRef)).trim()
    if (rawResult.length === 0) {
      return yield* fail(
        promptResult.stopReason === "cancelled"
          ? "Cursor ACP request was cancelled."
          : "Cursor Agent returned empty output.",
      )
    }
    return rawResult
  })

  const generateThreadTitle = Effect.fn("CursorTextGeneration.generateThreadTitle")(function* (
    input: ThreadTitleGenerationInput,
  ) {
    let promptInput: ThreadTitlePromptInput = { message: input.message }
    if (input.previousTitle !== undefined) {
      promptInput = Object.assign(promptInput, { previousTitle: input.previousTitle })
    }
    const raw = yield* promptRaw(
      "generateThreadTitle",
      input.cwd,
      buildThreadTitlePrompt(promptInput),
    )
    const generated = yield* decodeTitleOutput(extractJsonObject(raw)).pipe(
      Effect.mapError(() =>
        generationError("generateThreadTitle", "Cursor Agent returned invalid structured output."),
      ),
    )
    return { title: sanitizeThreadTitle(generated.title) }
  })

  const generateBranchName = Effect.fn("CursorTextGeneration.generateBranchName")(function* (
    input: BranchNameGenerationInput,
  ) {
    const raw = yield* promptRaw(
      "generateBranchName",
      input.cwd,
      buildBranchNamePrompt({ message: input.message }),
    )
    const generated = yield* decodeBranchOutput(extractJsonObject(raw)).pipe(
      Effect.mapError(() =>
        generationError("generateBranchName", "Cursor Agent returned invalid structured output."),
      ),
    )
    const branch = generated.branch.trim()
    if (branch.length === 0) {
      return yield* generationError("generateBranchName", "Cursor Agent returned an empty branch.")
    }
    return { branch }
  })

  const generateGitDraft = Effect.fn("CursorTextGeneration.generateGitDraft")(function* (
    input: GitDraftGenerationInput,
  ) {
    const raw = yield* promptRaw(
      "generateGitDraft",
      input.cwd,
      buildGitDraftPrompt(input.kind, input.context),
    )
    const generated = yield* decodeDraftOutput(extractJsonObject(raw)).pipe(
      Effect.mapError(() =>
        generationError("generateGitDraft", "Cursor Agent returned invalid structured output."),
      ),
    )
    const title = generated.title.trim()
    if (title.length === 0) {
      return yield* generationError("generateGitDraft", "Cursor Agent returned an empty title.")
    }
    const body = generated.body?.trim()
    return body === undefined || body.length === 0 ? { title } : { title, body }
  })

  return TextGeneration.of({
    generateThreadTitle: (input) =>
      generateThreadTitle(input).pipe(
        Effect.mapError((cause) =>
          isTextGenerationError(cause)
            ? cause
            : generationError("generateThreadTitle", "Cursor ACP text generation failed."),
        ),
        Effect.scoped,
      ),
    generateGitDraft: (input) =>
      generateGitDraft(input).pipe(
        Effect.mapError((cause) =>
          isTextGenerationError(cause)
            ? cause
            : generationError("generateGitDraft", "Cursor ACP text generation failed."),
        ),
        Effect.scoped,
      ),
    generateBranchName: (input) =>
      generateBranchName(input).pipe(
        Effect.mapError((cause) =>
          isTextGenerationError(cause)
            ? cause
            : generationError("generateBranchName", "Cursor ACP text generation failed."),
        ),
        Effect.scoped,
      ),
  })
})

export const cursorTextGenerationLayer = (options: CursorTextGenerationOptions = {}) =>
  Layer.effect(TextGeneration, makeCursorTextGeneration(options)).pipe(
    Layer.provide(NodeServices.layer),
  )
