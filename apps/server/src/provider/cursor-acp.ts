import * as NodeServices from "@effect/platform-node/NodeServices"
import * as AcpClient from "@noyau/acp/client"
import * as AcpError from "@noyau/acp/errors"
import type * as AcpSchema from "@noyau/acp/schema"
import type {
  ProviderApprovalDecision,
  ProviderUserInputAnswers,
} from "@noyau/protocol/entities/approvals"
import { emptyCursorProviderStatus, type CursorModel } from "@noyau/protocol/entities/environment"
import type { RuntimeMode } from "@noyau/protocol/entities/runtime-mode"
import type { TranscriptTool } from "@noyau/protocol/entities/transcript"
import { ApprovalRequestId, ProviderSessionId, ToolCallId } from "@noyau/protocol/ids"
import { Deferred, Effect, Fiber, FileSystem, Layer, Option, Path, Schema, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"

import {
  isCursorAboutJsonFormatUnsupported,
  parseCursorAboutOutput,
  type CursorAboutResult,
} from "./cursor-about.ts"
import {
  CursorAskQuestionRequest,
  CursorListAvailableModelsResponse,
} from "./cursor-acp-extension.ts"
import {
  ProviderPort,
  type ProviderEmit,
  type ProviderSignal,
  type ProviderTurnInput,
} from "./provider-port.ts"
import { deriveToolCallPresentation, type ToolCallPresentation } from "./tool-call-presentation.ts"

const ACP_VERSION = 1 as const
const CURSOR_AUTH_METHOD = "cursor_login"
const CURSOR_LIST_AVAILABLE_MODELS = "cursor/list_available_models"
const IMPLEMENT_MODE_ALIASES = ["code", "agent", "default", "chat", "implement"]
const APPROVAL_MODE_ALIASES = ["ask"]
const decodeCursorModels = Schema.decodeUnknownEffect(CursorListAvailableModelsResponse)

export interface CursorAdapterOptions {
  readonly binaryPath?: string
  readonly binaryArgs?: ReadonlyArray<string>
  readonly environment?: NodeJS.ProcessEnv
  readonly platform?: NodeJS.Platform
  readonly clientVersion?: string
}

interface PendingApproval {
  readonly decision: Deferred.Deferred<ProviderApprovalDecision>
}

interface ActiveTurn {
  readonly input: ProviderTurnInput
  readonly emit: ProviderEmit
  readonly promptSettled: Deferred.Deferred<void>
  readonly pendingApprovals: Map<string, PendingApproval>
  readonly pendingUserInputs: Map<string, Deferred.Deferred<ProviderUserInputAnswers>>
  acp?: AcpClient.AcpClient["Service"]
  handle?: ChildProcessSpawner.ChildProcessHandle
  sessionId?: string
  resumeSessionId?: string
  promptStarted: boolean
  cancelRequested: boolean
  stopRequested: boolean
  terminalEmitted: boolean
  fiber?: Fiber.Fiber<void>
}

const executableExists = (fileSystem: FileSystem.FileSystem, candidate: string) =>
  fileSystem.access(candidate, { ok: true }).pipe(
    Effect.as(true),
    Effect.orElseSucceed(() => false),
  )

/** Resolves the configured executable or the platform Cursor command on PATH. */
export const resolveCursorExecutable = Effect.fn("CursorAdapter.resolveExecutable")(function* (
  configuredPath: string | undefined,
  environment: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
) {
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const command = platform === "win32" ? "cursor-agent.exe" : "cursor-agent"
  const pathValue = environment.PATH ?? environment.Path ?? ""
  const delimiter = path.sep === "\\" ? ";" : ":"
  for (const directory of pathValue.split(delimiter)) {
    if (directory.trim().length === 0) {
      continue
    }
    const candidate = path.join(directory, command)
    if (yield* executableExists(fileSystem, candidate)) {
      return candidate
    }
  }
  const configured = configuredPath?.trim()
  if (
    configured !== undefined &&
    configured.length > 0 &&
    (yield* executableExists(fileSystem, configured))
  ) {
    return configured
  }
  return null
})

const ABOUT_TIMEOUT_MS = 8_000

const collectProcessText = <E>(stream: Stream.Stream<Uint8Array, E>) =>
  Stream.runCollect(stream).pipe(
    Effect.map((chunks) => {
      const total = chunks.reduce((size, part) => size + part.length, 0)
      const bytes = new Uint8Array(total)
      let offset = 0
      for (const part of chunks) {
        bytes.set(part, offset)
        offset += part.length
      }
      return new TextDecoder().decode(bytes)
    }),
  )

const runCursorCli = Effect.fn("CursorAdapter.runCli")(function* (
  executable: string,
  binaryArgs: ReadonlyArray<string>,
  args: ReadonlyArray<string>,
  environment: NodeJS.ProcessEnv,
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const handle = yield* spawner.spawn(
    ChildProcess.make(executable, [...binaryArgs, ...args], {
      env: environment,
      detached: false,
      windowsHide: true,
    }),
  )
  const [stdout, stderr, exitCode] = yield* Effect.all(
    [
      collectProcessText(handle.stdout),
      collectProcessText(handle.stderr),
      handle.exitCode.pipe(Effect.map(Number)),
    ],
    { concurrency: "unbounded" },
  )
  return { stdout, stderr, code: exitCode } satisfies CursorAboutResult
})

const probeCursorAbout = Effect.fn("CursorAdapter.probeAbout")(function* (
  executable: string,
  binaryArgs: ReadonlyArray<string>,
  environment: NodeJS.ProcessEnv,
) {
  const jsonResult = yield* runCursorCli(
    executable,
    binaryArgs,
    ["about", "--format", "json"],
    environment,
  ).pipe(Effect.scoped)
  if (!isCursorAboutJsonFormatUnsupported(jsonResult)) {
    return parseCursorAboutOutput(jsonResult)
  }
  const textResult = yield* runCursorCli(executable, binaryArgs, ["about"], environment).pipe(
    Effect.scoped,
  )
  return parseCursorAboutOutput(textResult)
})

const adapterError = (detail: string, cause?: unknown) =>
  new AcpError.AcpTransportError({
    detail,
    cause: cause ?? new Error(detail),
  })

const modeSearchText = (mode: AcpSchema.SessionMode) =>
  `${mode.id} ${mode.name} ${mode.description ?? ""}`.toLowerCase()

const findMode = (modes: ReadonlyArray<AcpSchema.SessionMode>, aliases: ReadonlyArray<string>) => {
  for (const alias of aliases) {
    const exact = modes.find(
      (mode) => mode.id.toLowerCase() === alias || mode.name.toLowerCase() === alias,
    )
    if (exact !== undefined) {
      return exact
    }
  }
  for (const alias of aliases) {
    const partial = modes.find((mode) => modeSearchText(mode).includes(alias))
    if (partial !== undefined) {
      return partial
    }
  }
  return undefined
}

const requestedMode = (runtimeMode: RuntimeMode, modes: AcpSchema.SessionModeState | undefined) => {
  if (modes === undefined) {
    return undefined
  }
  const aliases =
    runtimeMode === "approval-required" ? APPROVAL_MODE_ALIASES : IMPLEMENT_MODE_ALIASES
  const fallback =
    runtimeMode === "approval-required" ? IMPLEMENT_MODE_ALIASES : APPROVAL_MODE_ALIASES
  return (
    findMode(modes.availableModes, aliases) ??
    findMode(modes.availableModes, fallback) ??
    modes.availableModes[0]
  )?.id
}

const selectOptions = (
  option: AcpSchema.SessionConfigOption | undefined,
): ReadonlyArray<AcpSchema.SessionConfigSelectOption> => {
  if (option?.type !== "select") {
    return []
  }
  return option.options.flatMap((entry) => ("value" in entry ? [entry] : entry.options))
}

const normalizedConfigToken = (value: string | null | undefined) =>
  value?.trim().toLowerCase() ?? ""

const booleanConfigValue = (value: string | null | undefined) => {
  const normalized = normalizedConfigToken(value)
  if (["true", "on", "enabled"].includes(normalized)) {
    return true
  }
  if (["false", "off", "disabled"].includes(normalized)) {
    return false
  }
  return undefined
}

const isBooleanLikeOption = (option: AcpSchema.SessionConfigOption) => {
  if (option.type === "boolean") {
    return true
  }
  const values = new Set(
    selectOptions(option).flatMap((entry) => {
      const value = booleanConfigValue(entry.value) ?? booleanConfigValue(entry.name)
      return value === undefined ? [] : [value]
    }),
  )
  return values.has(true) && values.has(false)
}

const reasoningValue = (value: string) => {
  const normalized = normalizedConfigToken(value).replaceAll("_", "-")
  return ["low", "medium", "high", "xhigh", "extra-high", "extra high", "max", "ultra"].includes(
    normalized,
  )
}

const isReasoningOption = (option: AcpSchema.SessionConfigOption) => {
  const id = normalizedConfigToken(option.id)
  const name = normalizedConfigToken(option.name)
  return (
    option.type === "select" &&
    !isBooleanLikeOption(option) &&
    (id === "effort" ||
      id === "reasoning" ||
      name.includes("effort") ||
      name.includes("reasoning")) &&
    selectOptions(option).some((entry) => reasoningValue(entry.value) || reasoningValue(entry.name))
  )
}

const reasoningOption = (options: ReadonlyArray<AcpSchema.SessionConfigOption>) =>
  options.find(
    (option) =>
      isReasoningOption(option) && normalizedConfigToken(option.category) === "model_option",
  ) ?? options.find(isReasoningOption)

const isServiceTierOption = (option: AcpSchema.SessionConfigOption) => {
  const id = normalizedConfigToken(option.id)
  const name = normalizedConfigToken(option.name)
  const category = normalizedConfigToken(option.category)
  return (
    option.type === "select" &&
    (category === "service_tier" ||
      id === "service_tier" ||
      id === "servicetier" ||
      name.includes("service tier"))
  )
}

const serviceTierOption = (options: ReadonlyArray<AcpSchema.SessionConfigOption>) =>
  options.find(isServiceTierOption)

const isFastOption = (option: AcpSchema.SessionConfigOption) => {
  const id = normalizedConfigToken(option.id)
  const name = normalizedConfigToken(option.name)
  return (
    normalizedConfigToken(option.category) === "model_config" &&
    (id === "fast" || name === "fast" || name.includes("fast mode")) &&
    isBooleanLikeOption(option)
  )
}

const fastOption = (options: ReadonlyArray<AcpSchema.SessionConfigOption>) =>
  options.find(isFastOption)

const isThinkingOption = (option: AcpSchema.SessionConfigOption) => {
  const id = normalizedConfigToken(option.id)
  const name = normalizedConfigToken(option.name)
  return (
    normalizedConfigToken(option.category) === "model_config" &&
    (id === "thinking" || name.includes("thinking")) &&
    isBooleanLikeOption(option)
  )
}

const thinkingOption = (options: ReadonlyArray<AcpSchema.SessionConfigOption>) =>
  options.find(isThinkingOption)

const currentBooleanValue = (option: AcpSchema.SessionConfigOption | undefined) => {
  if (option?.type === "boolean") {
    return option.currentValue
  }
  return option?.type === "select" ? booleanConfigValue(option.currentValue) : undefined
}

const booleanSelectValue = (option: AcpSchema.SessionConfigOption, requestedValue: boolean) =>
  selectOptions(option).find(
    (entry) =>
      (booleanConfigValue(entry.value) ?? booleanConfigValue(entry.name)) === requestedValue,
  )?.value

type CursorModelOptionBuilder = {
  value: string
  label: string
  description?: string
  isDefault?: boolean
}

type CursorThinkingOptionBuilder = {
  label: string
  description?: string
  defaultValue?: boolean
}

const cursorModelOption = (
  option: AcpSchema.SessionConfigSelectOption,
  currentValue: string | undefined,
) => {
  const value = option.value.trim()
  const label = option.name.trim()
  const description = option.description?.trim()
  if (value === "" || label === "") {
    return undefined
  }
  const mapped: CursorModelOptionBuilder = {
    value,
    label,
  }
  if (description !== undefined && description !== "") {
    mapped.description = description
  }
  if (value === currentValue) {
    mapped.isDefault = true
  }
  return mapped
}

const cursorModels = (response: CursorListAvailableModelsResponse): ReadonlyArray<CursorModel> => {
  const seen = new Set<string>()
  const models: Array<CursorModel> = []
  for (const model of response.models) {
    const modelId = model.value.trim()
    const label = model.name.trim()
    if (modelId === "" || label === "" || seen.has(modelId)) {
      continue
    }
    seen.add(modelId)
    const reasoning = reasoningOption(model.configOptions ?? [])
    const reasoningCurrentValue = reasoning?.type === "select" ? reasoning.currentValue : undefined
    const efforts = selectOptions(reasoning).flatMap((effort) => {
      if (!reasoningValue(effort.value) && !reasoningValue(effort.name)) {
        return []
      }
      const mapped = cursorModelOption(effort, reasoningCurrentValue)
      return mapped === undefined ? [] : [mapped]
    })
    const tier = serviceTierOption(model.configOptions ?? [])
    const tierCurrentValue = tier?.type === "select" ? tier.currentValue : undefined
    let serviceTiers = selectOptions(tier).flatMap((option) => {
      const mapped = cursorModelOption(option, tierCurrentValue)
      return mapped === undefined ? [] : [mapped]
    })
    const fast = fastOption(model.configOptions ?? [])
    if (serviceTiers.length === 0 && fast !== undefined) {
      const fastDefault = currentBooleanValue(fast)
      const standardTier: CursorModelOptionBuilder = { value: "standard", label: "Standard" }
      const fastTier: CursorModelOptionBuilder = { value: "fast", label: "Fast" }
      if (fastDefault === false) {
        standardTier.isDefault = true
      }
      if (fastDefault === true) {
        fastTier.isDefault = true
      }
      const fastDescription = fast.description?.trim()
      if (fastDescription !== undefined && fastDescription !== "") {
        fastTier.description = fastDescription
      }
      serviceTiers = [standardTier, fastTier]
    }
    const thinking = thinkingOption(model.configOptions ?? [])
    const cursorModel = {
      modelId,
      label,
      reasoningEfforts: efforts,
      serviceTiers,
    }
    if (thinking !== undefined) {
      const thinkingModelOption: CursorThinkingOptionBuilder = { label: "Réflexion" }
      const thinkingDescription = thinking.description?.trim()
      if (thinkingDescription !== undefined && thinkingDescription !== "") {
        thinkingModelOption.description = thinkingDescription
      }
      const thinkingDefault = currentBooleanValue(thinking)
      if (thinkingDefault !== undefined) {
        thinkingModelOption.defaultValue = thinkingDefault
      }
      Object.assign(cursorModel, { thinking: thinkingModelOption })
    }
    models.push(cursorModel)
  }
  return models
}

const discoverModels = Effect.fn("CursorAdapter.discoverModels")(function* (
  acp: AcpClient.AcpClient["Service"],
) {
  const response = yield* acp.raw.request(CURSOR_LIST_AVAILABLE_MODELS, {})
  return cursorModels(yield* decodeCursorModels(response))
})

const approvalOutcome = (
  decision: ProviderApprovalDecision,
  options: ReadonlyArray<AcpSchema.PermissionOption>,
) => {
  const kinds =
    decision === "acceptForSession"
      ? ["allow_always", "allow_once"]
      : decision === "accept"
        ? ["allow_once", "allow_always"]
        : ["reject_once", "reject_always"]
  if (decision === "cancel") {
    return { outcome: { outcome: "cancelled" as const } }
  }
  for (const kind of kinds) {
    const selected = options.find((option) => option.kind === kind)
    if (selected !== undefined) {
      return { outcome: { outcome: "selected" as const, optionId: selected.optionId } }
    }
  }
  return { outcome: { outcome: "cancelled" as const } }
}

const autoApproval = (options: ReadonlyArray<AcpSchema.PermissionOption>) => {
  const selected =
    options.find((option) => option.kind === "allow_always") ??
    options.find((option) => option.kind === "allow_once")
  return selected === undefined
    ? { outcome: { outcome: "cancelled" as const } }
    : { outcome: { outcome: "selected" as const, optionId: selected.optionId } }
}

const toolStatus = (status: AcpSchema.ToolCallStatus | null | undefined) => {
  switch (status) {
    case "completed":
      return "completed" as const
    case "failed":
      return "error" as const
    case "pending":
    case "in_progress":
    case null:
    case undefined:
      return "in_progress" as const
  }
}

const toTranscriptTool = (
  control: ActiveTurn,
  toolCallId: string,
  status: TranscriptTool["status"],
  presentation: ToolCallPresentation,
): TranscriptTool => {
  const item = {
    _tag: "transcript.tool" as const,
    threadId: control.input.threadId,
    turnId: control.input.turnId,
    toolCallId: ToolCallId.make(toolCallId),
    name: presentation.name,
    status,
    action: presentation.action,
  }
  return presentation.outputSummary === undefined
    ? item
    : { ...item, outputSummary: presentation.outputSummary }
}

const errorDetail = (error: AcpError.AcpError) => {
  if (error._tag === "AcpRequestError") {
    const method = error.method ?? "request"
    return `Cursor ACP ${method} failed (${error.code}): ${error.errorMessage}`
  }
  if (error._tag === "AcpTransportError" && error.detail !== undefined) {
    return error.detail
  }
  return `Cursor ACP: ${error.message}`
}

type SessionSignal = Extract<ProviderSignal, { readonly _tag: "session" }>

const sessionSignal = (
  control: ActiveTurn,
  status: SessionSignal["status"],
  resumeCursor: SessionSignal["resumeCursor"],
  lastError?: string,
): ProviderSignal =>
  lastError === undefined
    ? {
        _tag: "session",
        threadId: control.input.threadId,
        turnId: control.input.turnId,
        status,
        resumeCursor,
      }
    : {
        _tag: "session",
        threadId: control.input.threadId,
        turnId: control.input.turnId,
        status,
        resumeCursor,
        lastError,
      }

const clientInfo = (clientVersion: string) => ({
  protocolVersion: ACP_VERSION,
  clientCapabilities: {
    fs: { readTextFile: false, writeTextFile: false },
    terminal: false,
    _meta: { parameterizedModelPicker: true },
  },
  clientInfo: { name: "noyau", version: clientVersion },
})

const initialize = Effect.fn("CursorAdapter.initialize")(function* (
  acp: AcpClient.AcpClient["Service"],
  clientVersion: string,
) {
  const response = yield* acp.agent.initialize(clientInfo(clientVersion))
  if (
    response.protocolVersion !== ACP_VERSION ||
    response.agentCapabilities?.loadSession !== true
  ) {
    return yield* adapterError("Cursor ACP is missing protocol v1 or session/load capability")
  }
  yield* acp.agent.authenticate({ methodId: CURSOR_AUTH_METHOD })
  return response
})

const makeCursorProvider = Effect.fn("CursorAdapter.make")(function* (
  options: CursorAdapterOptions = {},
) {
  const providerScope = yield* Effect.scope
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const environment = options.environment ?? process.env
  const platform = options.platform ?? process.platform
  const configuredPath = options.binaryPath ?? environment.NOYAU_CURSOR_PATH
  const binaryArgs = options.binaryArgs ?? []
  const clientVersion = options.clientVersion ?? "0.0.0"
  const active = new Map<string, ActiveTurn>()
  const turnFibers = new Map<string, Fiber.Fiber<void>>()

  const executable = yield* resolveCursorExecutable(configuredPath, environment, platform)

  const spawnHandle = Effect.fn("CursorAdapter.spawn")(function* (cwd: string) {
    if (executable === null) {
      return yield* adapterError(
        "Cursor provider is inactive: executable or required ACP capabilities missing",
      )
    }
    return yield* spawner
      .spawn(
        ChildProcess.make(executable, [...binaryArgs, "acp"], {
          cwd,
          env: environment,
          detached: false,
          windowsHide: true,
        }),
      )
      .pipe(
        Effect.mapError((cause) =>
          adapterError(`Failed to spawn Cursor ACP at ${executable}`, cause),
        ),
      )
  })

  const openClient = Effect.fn("CursorAdapter.openClient")(function* (cwd: string) {
    const handle = yield* spawnHandle(cwd)
    const context = yield* Layer.build(AcpClient.layerChildProcess(handle))
    const acp = yield* Effect.service(AcpClient.AcpClient).pipe(Effect.provideContext(context))
    return { handle, acp }
  })

  const probe =
    executable === null
      ? Effect.succeed(emptyCursorProviderStatus)
      : Effect.gen(function* () {
          const capabilities = yield* Effect.scoped(
            Effect.gen(function* () {
              const { acp } = yield* openClient(process.cwd())
              yield* initialize(acp, clientVersion)
              const models = yield* discoverModels(acp).pipe(
                Effect.catchCause(() => Effect.succeed([])),
              )
              return { handshakeOk: true, models }
            }).pipe(Effect.catchCause(() => Effect.succeed({ handshakeOk: false, models: [] }))),
          )
          const about = yield* probeCursorAbout(executable, binaryArgs, environment).pipe(
            Effect.timeoutOption(ABOUT_TIMEOUT_MS),
            Effect.map(
              Option.match({
                onNone: () => ({ version: null, plan: null }),
                onSome: (value) => value,
              }),
            ),
            Effect.catchCause(() => Effect.succeed({ version: null, plan: null })),
          )
          return {
            installed: true,
            handshakeOk: capabilities.handshakeOk,
            version: about.version,
            plan: about.plan,
            binaryPath: executable,
            models: capabilities.models,
          }
        })
  const providerStatus = yield* probe

  const emitPermission = Effect.fn("CursorAdapter.emitPermission")(function* (
    control: ActiveTurn,
    requestId: string,
    status: "pending" | "resolved",
  ) {
    yield* control.emit({
      _tag: "transcript",
      item: {
        _tag: "transcript.permission",
        threadId: control.input.threadId,
        turnId: control.input.turnId,
        requestId: ApprovalRequestId.make(requestId),
        status,
      },
    })
  })

  const handlePermission = Effect.fn("CursorAdapter.handlePermission")(function* (
    control: ActiveTurn,
    request: AcpSchema.RequestPermissionRequest,
  ) {
    if (request.sessionId !== control.sessionId) {
      return yield* AcpError.AcpRequestError.invalidRequest(
        "Permission request targets another Cursor session",
      )
    }
    const requestId = request.toolCall.toolCallId
    const presentation = deriveToolCallPresentation(request.toolCall)
    yield* control.emit({
      _tag: "transcript",
      item: toTranscriptTool(control, requestId, "in_progress", presentation),
    })
    const outcome = yield* Effect.gen(function* () {
      if (control.input.runtimeMode === "full-access") {
        yield* emitPermission(control, requestId, "pending")
        return autoApproval(request.options)
      }
      const selected = yield* Effect.acquireUseRelease(
        Effect.gen(function* () {
          const decision = yield* Deferred.make<ProviderApprovalDecision>()
          control.pendingApprovals.set(requestId, { decision })
          return decision
        }),
        (decision) =>
          emitPermission(control, requestId, "pending").pipe(
            Effect.andThen(Deferred.await(decision)),
          ),
        () =>
          Effect.sync(() => {
            control.pendingApprovals.delete(requestId)
          }),
      )
      return approvalOutcome(selected, request.options)
    })
    yield* emitPermission(control, requestId, "resolved")
    return outcome
  })

  const handleAskQuestion = Effect.fn("CursorAdapter.handleAskQuestion")(function* (
    control: ActiveTurn,
    request: CursorAskQuestionRequest,
  ) {
    if (request.sessionId !== undefined && request.sessionId !== control.sessionId) {
      return yield* AcpError.AcpRequestError.invalidRequest(
        "User-input request targets another Cursor session",
      )
    }
    const requestId = request.toolCallId ?? "cursor-ask-question"
    const deferred = yield* Deferred.make<ProviderUserInputAnswers>()
    control.pendingUserInputs.set(requestId, deferred)
    const prompt = request.questions?.[0]?.prompt
    const pendingItem =
      prompt === undefined
        ? {
            _tag: "transcript.user-input" as const,
            threadId: control.input.threadId,
            turnId: control.input.turnId,
            requestId: ApprovalRequestId.make(requestId),
            status: "pending" as const,
          }
        : {
            _tag: "transcript.user-input" as const,
            threadId: control.input.threadId,
            turnId: control.input.turnId,
            requestId: ApprovalRequestId.make(requestId),
            prompt,
            status: "pending" as const,
          }
    yield* control.emit({
      _tag: "transcript",
      item: pendingItem,
    })
    const answers = yield* Deferred.await(deferred)
    control.pendingUserInputs.delete(requestId)
    yield* control.emit({
      _tag: "transcript",
      item: { ...pendingItem, status: "resolved" },
    })
    return { answers }
  })

  const handleUpdate = Effect.fn("CursorAdapter.handleUpdate")(function* (
    control: ActiveTurn,
    loading: () => boolean,
    notification: AcpSchema.SessionNotification,
  ) {
    const replayMetadata = notification._meta
    if (
      loading() ||
      replayMetadata?.isReplay === true ||
      notification.sessionId !== control.sessionId
    ) {
      return
    }
    const update = notification.update
    switch (update.sessionUpdate) {
      case "agent_message_chunk": {
        if (update.content.type === "text" && update.content.text.length > 0) {
          yield* control.emit({
            _tag: "transcript",
            item: {
              _tag: "transcript.assistant",
              threadId: control.input.threadId,
              turnId: control.input.turnId,
              text: update.content.text,
            },
          })
        }
        return
      }
      case "tool_call":
      case "tool_call_update": {
        const presentation = deriveToolCallPresentation(update)
        yield* control.emit({
          _tag: "transcript",
          item: toTranscriptTool(
            control,
            update.toolCallId,
            toolStatus(update.status),
            presentation,
          ),
        })
        return
      }
      case "plan": {
        const markdown = update.entries
          .map((entry) => `- [${entry.status === "completed" ? "x" : " "}] ${entry.content}`)
          .join("\n")
        if (markdown.length > 0) {
          yield* control.emit({
            _tag: "transcript",
            item: {
              _tag: "transcript.plan",
              threadId: control.input.threadId,
              turnId: control.input.turnId,
              markdown,
            },
          })
        }
        return
      }
      default:
        return
    }
  })

  const runTurn = (control: ActiveTurn) =>
    Effect.scoped(
      Effect.gen(function* () {
        if (executable === null || !providerStatus.handshakeOk) {
          return yield* adapterError(
            "Cursor provider is inactive: executable or required ACP capabilities missing",
          )
        }
        const { acp, handle } = yield* openClient(control.input.workspaceRoot)
        control.handle = handle
        control.acp = acp
        let loading = false
        yield* acp.handleRequestPermission((request) => handlePermission(control, request))
        yield* acp.handleExtRequest("cursor/ask_question", CursorAskQuestionRequest, (request) =>
          handleAskQuestion(control, request),
        )
        yield* acp.handleSessionUpdate((notification) =>
          handleUpdate(control, () => loading, notification),
        )
        yield* initialize(acp, clientVersion)

        let setup: AcpSchema.NewSessionResponse | AcpSchema.LoadSessionResponse
        let sessionId: string
        const resumeSessionId = control.input.resumeCursor?.sessionId
        if (resumeSessionId !== undefined) {
          loading = true
          const loaded = yield* acp.agent
            .loadSession({
              sessionId: resumeSessionId,
              cwd: control.input.workspaceRoot,
              mcpServers: [],
            })
            .pipe(
              Effect.option,
              Effect.ensuring(
                Effect.sync(() => {
                  loading = false
                }),
              ),
            )
          if (loaded._tag === "Some") {
            setup = loaded.value
            sessionId = resumeSessionId
          } else {
            const created = yield* acp.agent.createSession({
              cwd: control.input.workspaceRoot,
              mcpServers: [],
            })
            setup = created
            sessionId = created.sessionId
          }
        } else {
          const created = yield* acp.agent.createSession({
            cwd: control.input.workspaceRoot,
            mcpServers: [],
          })
          setup = created
          sessionId = created.sessionId
        }
        control.sessionId = sessionId
        control.resumeSessionId = sessionId
        const resumeCursor = {
          schemaVersion: 1 as const,
          sessionId: ProviderSessionId.make(sessionId),
        }
        yield* control.emit(sessionSignal(control, "running", resumeCursor))

        let configOptions = setup.configOptions ?? []
        const selection = control.input.modelSelection
        if (selection !== null) {
          const modelOption = configOptions.find((option) => option.category === "model")
          const advertisedModel = selectOptions(modelOption).find(
            (option) => option.value === selection.modelId,
          )
          if (modelOption?.type === "select" && advertisedModel !== undefined) {
            const response = yield* acp.agent.setSessionConfigOption({
              sessionId,
              configId: modelOption.id,
              value: advertisedModel.value,
            })
            configOptions = response.configOptions
          } else if (
            setup.models?.availableModels.some((model) => model.modelId === selection.modelId) ===
            true
          ) {
            yield* acp.agent.setSessionModel({ sessionId, modelId: selection.modelId })
          } else {
            return yield* adapterError(`Cursor model is unavailable: ${selection.modelId}`)
          }

          if (selection.reasoningEffort !== undefined) {
            const effortOption = reasoningOption(configOptions)
            const advertisedEffort = selectOptions(effortOption).find(
              (option) => option.value === selection.reasoningEffort,
            )
            if (effortOption?.type !== "select" || advertisedEffort === undefined) {
              return yield* adapterError(
                `Cursor reasoning effort is unavailable: ${selection.reasoningEffort}`,
              )
            }
            const response = yield* acp.agent.setSessionConfigOption({
              sessionId,
              configId: effortOption.id,
              value: advertisedEffort.value,
            })
            configOptions = response.configOptions
          }

          if (selection.serviceTier !== undefined) {
            const tierOption = serviceTierOption(configOptions)
            const fast = fastOption(configOptions)
            const advertisedTier = selectOptions(tierOption).find(
              (option) => option.value === selection.serviceTier,
            )
            const response =
              tierOption?.type === "select" && advertisedTier !== undefined
                ? yield* acp.agent.setSessionConfigOption({
                    sessionId,
                    configId: tierOption.id,
                    value: advertisedTier.value,
                  })
                : fast?.type === "boolean" &&
                    ["standard", "normal", "fast"].includes(selection.serviceTier)
                  ? yield* acp.agent.setSessionConfigOption({
                      sessionId,
                      configId: fast.id,
                      type: "boolean",
                      value: selection.serviceTier === "fast",
                    })
                  : fast?.type === "select" &&
                      ["standard", "normal", "fast"].includes(selection.serviceTier)
                    ? yield* acp.agent.setSessionConfigOption({
                        sessionId,
                        configId: fast.id,
                        value:
                          booleanSelectValue(fast, selection.serviceTier === "fast") ??
                          selection.serviceTier,
                      })
                    : undefined
            if (response === undefined) {
              return yield* adapterError(
                `Cursor service tier is unavailable: ${selection.serviceTier}`,
              )
            }
            configOptions = response.configOptions
          }

          if (selection.thinking !== undefined) {
            const thinking = thinkingOption(configOptions)
            const response =
              thinking?.type === "boolean"
                ? yield* acp.agent.setSessionConfigOption({
                    sessionId,
                    configId: thinking.id,
                    type: "boolean",
                    value: selection.thinking,
                  })
                : thinking?.type === "select"
                  ? yield* acp.agent.setSessionConfigOption({
                      sessionId,
                      configId: thinking.id,
                      value:
                        booleanSelectValue(thinking, selection.thinking) ??
                        String(selection.thinking),
                    })
                  : undefined
            if (response === undefined) {
              return yield* adapterError("Cursor thinking option is unavailable")
            }
            configOptions = response.configOptions
          }
        }

        const mode = requestedMode(control.input.runtimeMode, setup.modes ?? undefined)
        if (mode !== undefined && mode !== setup.modes?.currentModeId) {
          yield* acp.agent
            .setSessionConfigOption({
              sessionId,
              configId: "mode",
              value: mode,
            })
            .pipe(Effect.ignore)
        }

        if (control.cancelRequested) {
          control.terminalEmitted = true
          yield* control.emit({
            _tag: "turn-ended",
            threadId: control.input.threadId,
            turnId: control.input.turnId,
            state: "interrupted",
          })
          if (control.stopRequested) {
            yield* control.emit(sessionSignal(control, "stopped", resumeCursor))
          }
          return
        }

        control.promptStarted = true
        const prompt: Array<AcpSchema.ContentBlock> = []
        if (control.input.text.trim().length > 0) {
          prompt.push({ type: "text", text: control.input.text })
        }
        for (const attachment of control.input.attachments ?? []) {
          prompt.push({
            type: "image",
            data: Buffer.from(attachment.data).toString("base64"),
            mimeType: attachment.mimeType,
          })
        }
        const response = yield* acp.agent
          .prompt({
            sessionId,
            prompt,
          })
          .pipe(Effect.ensuring(Deferred.succeed(control.promptSettled, undefined)))
        control.terminalEmitted = true
        yield* control.emit({
          _tag: "turn-ended",
          threadId: control.input.threadId,
          turnId: control.input.turnId,
          state: response.stopReason === "end_turn" ? "completed" : "interrupted",
        })
        if (control.stopRequested) {
          yield* control.emit(sessionSignal(control, "stopped", resumeCursor))
        }
      }).pipe(
        Effect.catch((error: AcpError.AcpError) =>
          control.terminalEmitted
            ? Effect.void
            : Effect.gen(function* () {
                control.terminalEmitted = true
                const detail = errorDetail(error)
                yield* control.emit(
                  sessionSignal(
                    control,
                    "error",
                    control.resumeSessionId === undefined
                      ? control.input.resumeCursor
                      : {
                          schemaVersion: 1,
                          sessionId: ProviderSessionId.make(control.resumeSessionId),
                        },
                    detail,
                  ),
                )
                yield* Deferred.succeed(control.promptSettled, undefined)
              }),
        ),
      ),
    ).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          if (active.get(control.input.threadId) === control) {
            active.delete(control.input.threadId)
          }
        }),
      ),
    )

  const startTurn = Effect.fn("CursorAdapter.startTurn")(function* (
    input: ProviderTurnInput,
    emit: ProviderEmit,
  ) {
    const promptSettled = yield* Deferred.make<void>()
    const control: ActiveTurn = {
      input,
      emit,
      promptSettled,
      pendingApprovals: new Map(),
      pendingUserInputs: new Map(),
      promptStarted: false,
      cancelRequested: false,
      stopRequested: false,
      terminalEmitted: false,
    }
    active.set(input.threadId, control)
    yield* emit(sessionSignal(control, "starting", input.resumeCursor))
    const fiber = yield* Effect.forkIn(runTurn(control), providerScope, { startImmediately: true })
    control.fiber = fiber
    turnFibers.set(input.threadId, fiber)
  })

  const cancel = Effect.fn("CursorAdapter.cancel")(function* (
    threadId: ProviderTurnInput["threadId"],
    stop: boolean,
  ) {
    const control = active.get(threadId)
    if (control === undefined) {
      return
    }
    control.cancelRequested = true
    control.stopRequested ||= stop
    for (const pending of control.pendingApprovals.values()) {
      yield* Deferred.succeed(pending.decision, "cancel")
    }
    for (const pending of control.pendingUserInputs.values()) {
      yield* Deferred.succeed(pending, {})
    }
    if (!control.promptStarted || control.acp === undefined || control.sessionId === undefined) {
      return
    }
    yield* control.acp.agent.cancel({ sessionId: control.sessionId }).pipe(Effect.ignore)
    yield* Deferred.await(control.promptSettled).pipe(
      Effect.raceFirst(
        Effect.sleep("2 seconds").pipe(
          Effect.tap(() =>
            control.handle === undefined
              ? Effect.void
              : control.handle.kill({ killSignal: "SIGKILL" }).pipe(Effect.ignore),
          ),
        ),
      ),
    )
  })

  const respondApproval = Effect.fn("CursorAdapter.respondApproval")(function* (
    threadId: ProviderTurnInput["threadId"],
    requestId: ApprovalRequestId,
    decision: ProviderApprovalDecision,
  ) {
    const pending = active.get(threadId)?.pendingApprovals.get(requestId)
    if (pending !== undefined) {
      yield* Deferred.succeed(pending.decision, decision)
    }
  })

  const respondUserInput = Effect.fn("CursorAdapter.respondUserInput")(function* (
    threadId: ProviderTurnInput["threadId"],
    requestId: ApprovalRequestId,
    answers: ProviderUserInputAnswers,
  ) {
    const pending = active.get(threadId)?.pendingUserInputs.get(requestId)
    if (pending !== undefined) {
      yield* Deferred.succeed(pending, answers)
    }
  })

  const drain = Effect.gen(function* () {
    const entries = [...turnFibers.entries()]
    yield* Effect.forEach(entries, ([, fiber]) => Fiber.join(fiber), { discard: true })
    for (const [threadId, fiber] of entries) {
      if (turnFibers.get(threadId) === fiber) {
        turnFibers.delete(threadId)
      }
    }
  })

  return ProviderPort.of({
    status: Effect.succeed(providerStatus),
    startTurn,
    interrupt: (threadId) => cancel(threadId, false),
    stop: (threadId) => cancel(threadId, true),
    respondApproval,
    respondUserInput,
    drain,
  })
})

export const cursorProviderLayer = (options: CursorAdapterOptions = {}) =>
  Layer.effect(ProviderPort, makeCursorProvider(options)).pipe(Layer.provide(NodeServices.layer))
