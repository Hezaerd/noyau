import * as NodeServices from "@effect/platform-node/NodeServices"
import * as AcpClient from "@noyau/acp/client"
import * as AcpError from "@noyau/acp/errors"
import type * as AcpSchema from "@noyau/acp/schema"
import type {
  ProviderApprovalDecision,
  ProviderUserInputAnswers,
} from "@noyau/contracts/entities/approvals"
import { contextUsageOf } from "@noyau/contracts/entities/context-usage"
import {
  emptyCursorProviderStatus,
  instanceConfigBinaryPath,
  ProviderDriverKind,
  ProviderInstanceId,
  providerInstanceView,
  type CursorModel,
} from "@noyau/contracts/entities/environment"
import type { RuntimeMode } from "@noyau/contracts/entities/runtime-mode"
import type { TranscriptTool } from "@noyau/contracts/entities/transcript"
import { ApprovalRequestId, ProviderSessionId, ToolCallId } from "@noyau/contracts/ids"
import { McpSessionRegistry } from "@noyau/server/mcp/mcp-session-registry"
import { ThreadLive, threadLiveLayer } from "@noyau/server/thread-live"
import {
  Clock,
  Deferred,
  Duration,
  Effect,
  Exit,
  Fiber,
  FileSystem,
  Layer,
  Option,
  Path,
  Schema,
  Scope,
} from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"

import { takeBufferedAssistantSpill } from "./assistant-delivery.ts"
import {
  CursorAskQuestionRequest,
  CursorListAvailableModelsResponse,
} from "./cursor-acp-extension.ts"
import { promptContentBlocks } from "./prompt-blocks.ts"
import {
  ProviderPort,
  singleInstanceStatuses,
  type ProviderEmit,
  type ProviderSignal,
  type ProviderTurnInput,
} from "./provider-port.ts"
import {
  deriveToolCallPresentation,
  mergeToolCallPresentationInput,
  type ToolCallPresentation,
  type ToolCallPresentationInput,
} from "./tool-call-presentation.ts"
import { TurnUserInputRegistry, turnUserInputRegistryLayer } from "./turn-user-input-registry.ts"

const ACP_VERSION = 1 as const
const CURSOR_AUTH_METHOD = "cursor_login"
const CURSOR_LIST_AVAILABLE_MODELS = "cursor/list_available_models"
const IMPLEMENT_MODE_ALIASES = ["code", "agent", "default", "chat", "implement"]
const APPROVAL_MODE_ALIASES = ["ask"]
/** Cursor may leave `session/load` pending after replay; treat an idle gap as ready. */
const DEFAULT_SESSION_LOAD_REPLAY_IDLE_GAP = Duration.seconds(2)
const DEFAULT_SESSION_LOAD_TIMEOUT = Duration.seconds(90)
const decodeCursorModels = Schema.decodeUnknownEffect(CursorListAvailableModelsResponse)

export interface CursorAdapterOptions {
  readonly instanceId?: ProviderInstanceId
  readonly instanceConfig?: unknown
  readonly binaryPath?: string
  readonly binaryArgs?: ReadonlyArray<string>
  readonly environment?: NodeJS.ProcessEnv
  readonly platform?: NodeJS.Platform
  readonly clientVersion?: string
  readonly sessionLoadReplayIdleGap?: Duration.Input | undefined
  readonly sessionLoadTimeout?: Duration.Input | undefined
}

interface PendingApproval {
  readonly decision: Deferred.Deferred<ProviderApprovalDecision>
}

interface CursorSession {
  readonly threadId: ProviderTurnInput["threadId"]
  readonly projectId: ProviderTurnInput["projectId"]
  readonly workspaceRoot: string
  readonly scope: Scope.Closeable
  readonly acp: AcpClient.AcpClient["Service"]
  readonly handle: ChildProcessSpawner.ChildProcessHandle
  sessionId: string
  resumeCursor: ProviderTurnInput["resumeCursor"]
  setup: AcpSchema.NewSessionResponse | AcpSchema.LoadSessionResponse | undefined
  configOptions: ReadonlyArray<AcpSchema.SessionConfigOption>
  modes: AcpSchema.SessionModeState | undefined
  loading: boolean
  loadLastActivityAt: number | undefined
  activeTurn: ActiveTurn | undefined
  stopped: boolean
}

interface ActiveTurn {
  readonly input: ProviderTurnInput
  readonly emit: ProviderEmit
  readonly promptSettled: Deferred.Deferred<void>
  readonly pendingApprovals: Map<string, PendingApproval>
  readonly toolCalls: Map<string, ToolCallPresentationInput>
  pendingAssistantText: string
  flushedAssistantText: string
  readonly live: ThreadLive["Service"]
  session?: CursorSession
  acp?: AcpClient.AcpClient["Service"]
  handle?: ChildProcessSpawner.ChildProcessHandle
  sessionId?: string
  resumeSessionId?: string
  promptStarted: boolean
  mcpActivated: boolean
  cancelRequested: boolean
  stopRequested: boolean
  terminalEmitted: boolean
  fiber?: Fiber.Fiber<void>
}

const visibleAssistantText = (control: ActiveTurn) =>
  `${control.flushedAssistantText}${control.pendingAssistantText}`

const publishAssistantLive = (control: ActiveTurn) =>
  control.live.publish({
    threadId: control.input.threadId,
    turnId: control.input.turnId,
    text: visibleAssistantText(control),
  })

const flushAssistantText = Effect.fn("CursorAdapter.flushAssistantText")(function* (
  control: ActiveTurn,
) {
  const text = control.pendingAssistantText
  if (text.length === 0) {
    return
  }
  control.pendingAssistantText = ""
  control.flushedAssistantText = `${control.flushedAssistantText}${text}`
  yield* control.emit({
    _tag: "transcript",
    item: {
      _tag: "transcript.assistant",
      threadId: control.input.threadId,
      turnId: control.input.turnId,
      text,
    },
  })
  yield* publishAssistantLive(control)
})

const enqueueAssistantText = Effect.fn("CursorAdapter.enqueueAssistantText")(function* (
  control: ActiveTurn,
  text: string,
) {
  const next = takeBufferedAssistantSpill(control.pendingAssistantText, text)
  if (next.spill.length > 0) {
    control.pendingAssistantText = next.spill
    yield* flushAssistantText(control)
    return
  }
  control.pendingAssistantText = next.pending
  yield* publishAssistantLive(control)
})

const emitSignal = Effect.fn("CursorAdapter.emitSignal")(function* (
  control: ActiveTurn,
  signal: ProviderSignal,
) {
  yield* flushAssistantText(control)
  yield* control.emit(signal)
})

const executableExists = (fileSystem: FileSystem.FileSystem, candidate: string) =>
  fileSystem.access(candidate, { ok: true }).pipe(
    Effect.as(true),
    Effect.orElseSucceed(() => false),
  )

/** Resolves an explicit configured path, else the platform Cursor command on PATH. */
export const resolveCursorExecutable = Effect.fn("CursorAdapter.resolveExecutable")(function* (
  configuredPath: string | undefined,
  environment: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
) {
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const command = platform === "win32" ? "cursor-agent.exe" : "cursor-agent"
  const configured = configuredPath?.trim()
  const configuredIsExplicitPath =
    configured !== undefined &&
    configured.length > 0 &&
    (path.isAbsolute(configured) || configured.includes("/") || configured.includes("\\"))
  if (configuredIsExplicitPath && (yield* executableExists(fileSystem, configured))) {
    return configured
  }
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
  if (
    configured !== undefined &&
    configured.length > 0 &&
    (yield* executableExists(fileSystem, configured))
  ) {
    return configured
  }
  return null
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
      const thinkingModelOption: CursorThinkingOptionBuilder = { label: "Thinking" }
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

const rememberToolCall = (
  control: ActiveTurn,
  toolCallId: string,
  incoming: ToolCallPresentationInput,
): ToolCallPresentation => {
  const merged = mergeToolCallPresentationInput(control.toolCalls.get(toolCallId), incoming)
  control.toolCalls.set(toolCallId, merged)
  return deriveToolCallPresentation(merged)
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

const turnResumeCursor = (control: ActiveTurn): SessionSignal["resumeCursor"] =>
  control.session?.resumeCursor ??
  (control.resumeSessionId === undefined
    ? control.input.resumeCursor
    : {
        schemaVersion: 1,
        sessionId: ProviderSessionId.make(control.resumeSessionId),
      })

/** User cancel must not become Session/Turn error — the sidebar treats that as Error. */
const emitCanceledTerminal = Effect.fn("CursorAdapter.emitCanceledTerminal")(function* (
  control: ActiveTurn,
  resumeCursor: SessionSignal["resumeCursor"],
) {
  yield* emitSignal(control, {
    _tag: "turn-ended",
    threadId: control.input.threadId,
    turnId: control.input.turnId,
    state: "interrupted",
  })
  yield* emitSignal(
    control,
    sessionSignal(control, control.stopRequested ? "stopped" : "ready", resumeCursor),
  )
})

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
    response.agentCapabilities?.loadSession !== true ||
    response.agentCapabilities.mcpCapabilities?.http !== true
  ) {
    return yield* adapterError(
      "Cursor ACP is missing protocol v1, session/load, or MCP HTTP capability",
    )
  }
  yield* acp.agent.authenticate({ methodId: CURSOR_AUTH_METHOD })
  return response
})

export const makeCursorProvider = Effect.fn("CursorAdapter.make")(function* (
  options: CursorAdapterOptions = {},
) {
  const threadLive = yield* ThreadLive
  const providerScope = yield* Effect.scope
  const path = yield* Path.Path
  const mcpSessions = yield* McpSessionRegistry
  const userInputs = yield* TurnUserInputRegistry
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const environment = options.environment ?? process.env
  const platform = options.platform ?? process.platform
  const instanceId = options.instanceId ?? ProviderInstanceId.make("cursor")
  const configuredPath =
    environment.NOYAU_CURSOR_PATH ??
    options.binaryPath ??
    instanceConfigBinaryPath(options.instanceConfig)
  const binaryArgs = options.binaryArgs ?? []
  const clientVersion = options.clientVersion ?? "0.0.0"
  const active = new Map<string, ActiveTurn>()
  const queued = new Map<string, ActiveTurn>()
  const sessions = new Map<string, CursorSession>()
  const turnFibers = new Map<string, Fiber.Fiber<void>>()

  const executable = yield* resolveCursorExecutable(configuredPath, environment, platform)

  const spawnHandle = Effect.fn("CursorAdapter.spawn")(function* (
    cwd: string,
    sessionScope?: Scope.Scope,
  ) {
    if (executable === null) {
      return yield* adapterError(
        "Cursor provider is inactive: executable or required ACP capabilities missing",
      )
    }
    const spawned = spawner
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
    return yield* sessionScope === undefined
      ? spawned
      : spawned.pipe(Effect.provideService(Scope.Scope, sessionScope))
  })

  const openClient = Effect.fn("CursorAdapter.openClient")(function* (
    cwd: string,
    sessionScope?: Scope.Scope,
  ) {
    const handle = yield* spawnHandle(cwd, sessionScope)
    const context = yield* sessionScope === undefined
      ? Layer.build(AcpClient.layerChildProcess(handle))
      : Layer.buildWithScope(AcpClient.layerChildProcess(handle), sessionScope)
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
          // `cursor-agent about` (JSON puis texte) peut pendre 3–10 s. Version/plan
          // sont décoratifs ; le handshake ACP suffit pour le ready Electron.
          return {
            installed: true,
            handshakeOk: capabilities.handshakeOk,
            version: null,
            plan: null,
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
    yield* emitSignal(control, {
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
    const presentation = rememberToolCall(control, requestId, request.toolCall)
    yield* emitSignal(control, {
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
    const requestId = ApprovalRequestId.make(request.toolCallId ?? "cursor-ask-question")
    const questions = request.questions?.map((question) => {
      const mapped = {
        id: question.id,
        prompt: question.prompt,
        options: question.options.map((option) => ({ id: option.id, label: option.label })),
      }
      return question.allowMultiple === undefined
        ? mapped
        : Object.assign(mapped, { allowMultiple: question.allowMultiple })
    })
    const prompt = questions?.[0]?.prompt
    const requestInput = {
      threadId: control.input.threadId,
      turnId: control.input.turnId,
      requestId,
    }
    const withTitle =
      request.title === undefined
        ? requestInput
        : Object.assign(requestInput, { title: request.title })
    const withPrompt = prompt === undefined ? withTitle : Object.assign(withTitle, { prompt })
    const withQuestions =
      questions === undefined || questions.length === 0
        ? withPrompt
        : Object.assign(withPrompt, { questions })
    const answers = yield* userInputs
      .request(withQuestions)
      .pipe(
        Effect.mapError((error) =>
          AcpError.AcpRequestError.invalidRequest(
            error._tag === "UserInputTurnInactive"
              ? "User-input request outside an active Turn"
              : "User-input request failed",
          ),
        ),
      )
    return { answers }
  })

  const handleUpdate = Effect.fn("CursorAdapter.handleUpdate")(function* (
    control: ActiveTurn,
    loading: () => boolean,
    notification: AcpSchema.SessionNotification,
  ) {
    const replayMetadata = notification._meta
    if (notification.sessionId !== control.sessionId) {
      return
    }
    const update = notification.update
    if (update.sessionUpdate === "usage_update") {
      const usage = contextUsageOf(update.used, update.size)
      if (usage !== null) {
        yield* emitSignal(control, {
          _tag: "context-usage",
          threadId: control.input.threadId,
          used: usage.used,
          window: usage.window,
        })
      }
      return
    }
    if (loading() || replayMetadata?.isReplay === true) {
      return
    }
    switch (update.sessionUpdate) {
      case "agent_message_chunk": {
        if (update.content.type === "text" && update.content.text.length > 0) {
          yield* enqueueAssistantText(control, update.content.text)
        }
        return
      }
      case "tool_call":
      case "tool_call_update": {
        const presentation = rememberToolCall(control, update.toolCallId, update)
        yield* emitSignal(control, {
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
          yield* emitSignal(control, {
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

  const sessionLoadReplayIdleGap = Duration.fromInputUnsafe(
    options.sessionLoadReplayIdleGap ?? DEFAULT_SESSION_LOAD_REPLAY_IDLE_GAP,
  )
  const sessionLoadTimeout = Duration.fromInputUnsafe(
    options.sessionLoadTimeout ?? DEFAULT_SESSION_LOAD_TIMEOUT,
  )

  const waitForSessionLoadReplayIdle = (session: CursorSession) =>
    Effect.gen(function* () {
      const idleGapMillis = Duration.toMillis(sessionLoadReplayIdleGap)
      while (true) {
        if (session.loading && session.loadLastActivityAt !== undefined) {
          const now = yield* Clock.currentTimeMillis
          if (now - session.loadLastActivityAt >= idleGapMillis) {
            return {
              _tag: "idle" as const,
              modes: session.modes,
              configOptions: session.configOptions,
            }
          }
        }
        yield* Effect.sleep(Duration.millis(25))
      }
    })

  const closeSession = Effect.fn("CursorAdapter.closeSession")(function* (session: CursorSession) {
    if (session.stopped) {
      return
    }
    session.stopped = true
    if (sessions.get(session.threadId) === session) {
      sessions.delete(session.threadId)
    }
    const control = session.activeTurn
    if (control !== undefined) {
      for (const pending of control.pendingApprovals.values()) {
        yield* Deferred.succeed(pending.decision, "cancel").pipe(Effect.ignore)
      }
      yield* userInputs.cancelTurn(session.threadId)
    }
    yield* Scope.close(session.scope, Exit.void).pipe(Effect.ignore)
  })

  const runTurn = (control: ActiveTurn) =>
    Effect.gen(function* () {
      if (executable === null || !providerStatus.handshakeOk) {
        return yield* adapterError(
          "Cursor provider is inactive: executable or required ACP capabilities missing",
        )
      }

      let session = sessions.get(control.input.threadId)
      if (session !== undefined && !session.stopped) {
        const credentialAlive = yield* mcpSessions.touchSession(control.input.threadId)
        if (!credentialAlive) {
          yield* closeSession(session)
          session = undefined
        }
      }
      let transferred = false
      if (session === undefined || session.stopped) {
        const sessionScope = yield* Scope.make("sequential")
        const releaseUntransferred = Effect.suspend(() =>
          transferred ? Effect.void : Scope.close(sessionScope, Exit.void).pipe(Effect.ignore),
        )
        yield* Effect.addFinalizer(() => releaseUntransferred)
        const { acp, handle } = yield* openClient(control.input.workspaceRoot, sessionScope).pipe(
          Effect.onError(() => releaseUntransferred),
        )
        const created: CursorSession = {
          threadId: control.input.threadId,
          projectId: control.input.projectId,
          workspaceRoot: control.input.workspaceRoot,
          scope: sessionScope,
          acp,
          handle,
          sessionId: "",
          resumeCursor: control.input.resumeCursor,
          setup: undefined,
          configOptions: [],
          modes: undefined,
          loading: false,
          loadLastActivityAt: undefined,
          activeTurn: undefined,
          stopped: false,
        }
        session = created
        control.session = created
        control.handle = handle
        control.acp = acp

        yield* acp.handleRequestPermission((request) => {
          const current = created.activeTurn
          return current === undefined
            ? AcpError.AcpRequestError.invalidRequest("Permission request outside an active Turn")
            : handlePermission(current, request)
        })
        yield* acp.handleExtRequest("cursor/ask_question", CursorAskQuestionRequest, (request) => {
          const current = created.activeTurn
          return current === undefined
            ? AcpError.AcpRequestError.invalidRequest("User-input request outside an active Turn")
            : handleAskQuestion(current, request)
        })
        yield* acp.handleSessionUpdate((notification) =>
          Effect.gen(function* () {
            if (created.loading) {
              created.loadLastActivityAt = yield* Clock.currentTimeMillis
              if (notification.update.sessionUpdate !== "usage_update") {
                return
              }
            }
            const current = created.activeTurn
            if (current === undefined) {
              return
            }
            yield* handleUpdate(current, () => created.loading, notification)
          }),
        )
        yield* initialize(acp, clientVersion)

        const mcpCredential = yield* mcpSessions.issue({
          projectId: control.input.projectId,
          threadId: control.input.threadId,
        })
        yield* Scope.addFinalizer(sessionScope, mcpSessions.revokeSession(control.input.threadId))
        const mcpServers: ReadonlyArray<AcpSchema.McpServer> = [
          {
            type: "http",
            name: "noyau",
            url: mcpCredential.config.endpoint,
            headers: [
              {
                name: "Authorization",
                value: mcpCredential.config.authorizationHeader,
              },
            ],
          },
        ]

        const resumeSessionId = control.input.resumeCursor?.sessionId
        let setup: AcpSchema.NewSessionResponse | AcpSchema.LoadSessionResponse
        let sessionId: string
        if (resumeSessionId !== undefined) {
          created.loading = true
          created.loadLastActivityAt = undefined
          created.activeTurn = control
          control.sessionId = resumeSessionId
          const loaded = yield* Effect.raceFirst(
            acp.agent
              .loadSession({
                sessionId: resumeSessionId,
                cwd: control.input.workspaceRoot,
                mcpServers,
              })
              .pipe(Effect.map((response) => ({ _tag: "rpc" as const, response }))),
            waitForSessionLoadReplayIdle(created),
          ).pipe(
            Effect.timeoutOption(sessionLoadTimeout),
            Effect.orElseSucceed(() => Option.none()),
            Effect.ensuring(
              Effect.sync(() => {
                created.loading = false
                created.loadLastActivityAt = undefined
              }),
            ),
          )
          if (Option.isSome(loaded)) {
            sessionId = resumeSessionId
            if (loaded.value._tag === "rpc") {
              setup = loaded.value.response
            } else {
              if (loaded.value.modes !== undefined) {
                created.modes = loaded.value.modes
              }
              if (loaded.value.configOptions.length > 0) {
                created.configOptions = loaded.value.configOptions
              }
              let idleSetup: AcpSchema.LoadSessionResponse = {
                configOptions: created.configOptions,
              }
              if (created.modes !== undefined) {
                idleSetup = { ...idleSetup, modes: created.modes }
              }
              if (created.setup?.models != null) {
                idleSetup = { ...idleSetup, models: created.setup.models }
              }
              setup = idleSetup
            }
          } else {
            const createdSession = yield* acp.agent.createSession({
              cwd: control.input.workspaceRoot,
              mcpServers,
            })
            setup = createdSession
            sessionId = createdSession.sessionId
          }
        } else {
          const createdSession = yield* acp.agent.createSession({
            cwd: control.input.workspaceRoot,
            mcpServers,
          })
          setup = createdSession
          sessionId = createdSession.sessionId
        }
        created.setup = setup
        created.configOptions = setup.configOptions ?? []
        created.modes = setup.modes ?? undefined
        created.sessionId = sessionId
        created.resumeCursor = {
          schemaVersion: 1 as const,
          sessionId: ProviderSessionId.make(sessionId),
        }
        created.activeTurn = control
        sessions.set(control.input.threadId, created)
        transferred = true
        yield* emitSignal(control, sessionSignal(control, "running", created.resumeCursor))
      } else {
        control.session = session
        control.handle = session.handle
        control.acp = session.acp
        control.sessionId = session.sessionId
        control.resumeSessionId = session.sessionId
        session.activeTurn = control
      }

      const currentSession = session
      const setup = currentSession.setup
      if (setup === undefined) {
        return yield* adapterError("Cursor ACP session setup did not return a session")
      }
      control.sessionId = currentSession.sessionId
      control.resumeSessionId = currentSession.sessionId
      currentSession.activeTurn = control
      let configOptions = currentSession.configOptions
      const selection = control.input.modelSelection
      if (selection !== null) {
        const modelOption = configOptions.find((option) => option.category === "model")
        const advertisedModel = selectOptions(modelOption).find(
          (option) => option.value === selection.modelId,
        )
        if (modelOption?.type === "select" && advertisedModel !== undefined) {
          const response = yield* currentSession.acp.agent.setSessionConfigOption({
            sessionId: currentSession.sessionId,
            configId: modelOption.id,
            value: advertisedModel.value,
          })
          configOptions = response.configOptions
        } else if (
          setup.models?.availableModels.some((model) => model.modelId === selection.modelId) ===
          true
        ) {
          yield* currentSession.acp.agent.setSessionModel({
            sessionId: currentSession.sessionId,
            modelId: selection.modelId,
          })
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
          const response = yield* currentSession.acp.agent.setSessionConfigOption({
            sessionId: currentSession.sessionId,
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
              ? yield* currentSession.acp.agent.setSessionConfigOption({
                  sessionId: currentSession.sessionId,
                  configId: tierOption.id,
                  value: advertisedTier.value,
                })
              : fast?.type === "boolean" &&
                  ["standard", "normal", "fast"].includes(selection.serviceTier)
                ? yield* currentSession.acp.agent.setSessionConfigOption({
                    sessionId: currentSession.sessionId,
                    configId: fast.id,
                    type: "boolean",
                    value: selection.serviceTier === "fast",
                  })
                : fast?.type === "select" &&
                    ["standard", "normal", "fast"].includes(selection.serviceTier)
                  ? yield* currentSession.acp.agent.setSessionConfigOption({
                      sessionId: currentSession.sessionId,
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
              ? yield* currentSession.acp.agent.setSessionConfigOption({
                  sessionId: currentSession.sessionId,
                  configId: thinking.id,
                  type: "boolean",
                  value: selection.thinking,
                })
              : thinking?.type === "select"
                ? yield* currentSession.acp.agent.setSessionConfigOption({
                    sessionId: currentSession.sessionId,
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

      currentSession.configOptions = configOptions
      const mode = requestedMode(control.input.runtimeMode, currentSession.modes)
      if (mode !== undefined && mode !== currentSession.modes?.currentModeId) {
        yield* currentSession.acp.agent.setSessionConfigOption({
          sessionId: currentSession.sessionId,
          configId: "mode",
          value: mode,
        })
        if (currentSession.modes !== undefined) {
          currentSession.modes = { ...currentSession.modes, currentModeId: mode }
        }
      }

      if (control.cancelRequested) {
        control.terminalEmitted = true
        yield* emitSignal(control, {
          _tag: "turn-ended",
          threadId: control.input.threadId,
          turnId: control.input.turnId,
          state: "interrupted",
        })
        if (control.stopRequested) {
          yield* emitSignal(control, sessionSignal(control, "stopped", currentSession.resumeCursor))
          yield* closeSession(currentSession)
        }
        return
      }

      yield* mcpSessions.activateTurn(control.input.threadId, control.input.turnId)
      control.mcpActivated = true
      control.promptStarted = true
      const prompt: Array<AcpSchema.ContentBlock> = []
      if (control.input.text.trim().length > 0) {
        prompt.push(
          ...(yield* promptContentBlocks(
            control.input.text,
            control.input.workspaceRoot,
            control.input.tickets ?? [],
          ).pipe(Effect.provideService(Path.Path, path))),
        )
      }
      for (const attachment of control.input.attachments ?? []) {
        prompt.push({
          type: "image",
          data: Buffer.from(attachment.data).toString("base64"),
          mimeType: attachment.mimeType,
        })
      }
      const response = yield* currentSession.acp.agent
        .prompt({
          sessionId: currentSession.sessionId,
          prompt,
        })
        .pipe(Effect.ensuring(Deferred.succeed(control.promptSettled, undefined)))
      control.terminalEmitted = true
      yield* emitSignal(control, {
        _tag: "turn-ended",
        threadId: control.input.threadId,
        turnId: control.input.turnId,
        state: response.stopReason === "end_turn" ? "completed" : "interrupted",
      })
      if (control.stopRequested) {
        yield* emitSignal(control, sessionSignal(control, "stopped", currentSession.resumeCursor))
      } else {
        yield* emitSignal(control, sessionSignal(control, "ready", currentSession.resumeCursor))
      }
    }).pipe(
      Effect.catch((error: AcpError.AcpError) =>
        control.terminalEmitted
          ? Effect.void
          : Effect.gen(function* () {
              control.terminalEmitted = true
              const currentSession = control.session
              const resumeCursor = turnResumeCursor(control)
              if (currentSession !== undefined) {
                yield* closeSession(currentSession)
              }
              if (control.cancelRequested || control.stopRequested) {
                yield* emitCanceledTerminal(control, resumeCursor)
              } else {
                yield* emitSignal(
                  control,
                  sessionSignal(control, "error", resumeCursor, errorDetail(error)),
                )
              }
              yield* Deferred.succeed(control.promptSettled, undefined)
            }),
      ),
      Effect.ensuring(
        flushAssistantText(control).pipe(
          Effect.andThen(threadLive.clear(control.input.threadId)),
          Effect.andThen(userInputs.unbindTurn(control.input.threadId)),
          Effect.andThen(
            Effect.suspend(() =>
              control.mcpActivated
                ? mcpSessions
                    .deactivateTurn(control.input.threadId, control.input.turnId)
                    .pipe(Effect.ignore)
                : Effect.void,
            ),
          ),
          Effect.andThen(
            Effect.sync(() => {
              if (control.session?.activeTurn === control) {
                control.session.activeTurn = undefined
              }
              if (control.mcpActivated) {
                control.mcpActivated = false
              }
              if (active.get(control.input.threadId) === control) {
                active.delete(control.input.threadId)
              }
            }),
          ),
          Effect.ignore,
        ),
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
      toolCalls: new Map(),
      pendingAssistantText: "",
      flushedAssistantText: "",
      live: threadLive,
      promptStarted: false,
      mcpActivated: false,
      cancelRequested: false,
      stopRequested: false,
      terminalEmitted: false,
    }

    const previous = turnFibers.get(input.threadId)
    queued.set(input.threadId, control)
    const runQueued = Effect.gen(function* () {
      if (previous !== undefined) {
        yield* Fiber.join(previous).pipe(Effect.ignore)
      }
      if (queued.get(input.threadId) !== control) {
        return
      }
      queued.delete(input.threadId)

      let existing = sessions.get(input.threadId)
      if (
        existing !== undefined &&
        !existing.stopped &&
        (existing.projectId !== input.projectId || existing.workspaceRoot !== input.workspaceRoot)
      ) {
        yield* closeSession(existing)
        existing = undefined
      }
      if (existing !== undefined && !existing.stopped) {
        const running = yield* existing.handle.isRunning.pipe(Effect.orElseSucceed(() => false))
        if (!running) {
          yield* closeSession(existing)
          existing = undefined
        }
      }

      yield* userInputs.bindTurn(input.threadId, (signal) => emitSignal(control, signal))
      active.set(input.threadId, control)
      yield* emitSignal(
        control,
        sessionSignal(
          control,
          existing === undefined ? "starting" : "running",
          existing?.resumeCursor ?? input.resumeCursor,
        ),
      )
      yield* runTurn(control)
    })
    const fiber = yield* Effect.forkIn(
      Effect.scoped(runQueued),
      providerScope,
      previous === undefined ? { startImmediately: true } : undefined,
    )
    control.fiber = fiber
    turnFibers.set(input.threadId, fiber)
  })

  const cancel = Effect.fn("CursorAdapter.cancel")(function* (
    threadId: ProviderTurnInput["threadId"],
    stop: boolean,
  ) {
    const control = active.get(threadId) ?? queued.get(threadId)
    if (control === undefined) {
      if (stop) {
        const session = sessions.get(threadId)
        if (session !== undefined) {
          yield* closeSession(session)
        }
      }
      return
    }
    control.cancelRequested = true
    control.stopRequested ||= stop
    for (const pending of control.pendingApprovals.values()) {
      yield* Deferred.succeed(pending.decision, "cancel")
    }
    yield* userInputs.cancelTurn(threadId)
    if (!control.promptStarted || control.acp === undefined || control.sessionId === undefined) {
      const session = control.session ?? sessions.get(threadId)
      if (session !== undefined && (stop || sessions.get(threadId) !== session)) {
        yield* closeSession(session)
      } else if (control.handle !== undefined && control.handle !== session?.handle) {
        yield* control.handle.kill({ killSignal: "SIGTERM" }).pipe(Effect.ignore)
      }
      if (control.fiber !== undefined) {
        yield* Fiber.join(control.fiber).pipe(
          Effect.ignoreCause,
          Effect.raceFirst(
            Effect.sleep("2 seconds").pipe(
              Effect.tap(() =>
                control.handle === undefined || control.handle === session?.handle
                  ? Effect.void
                  : control.handle.kill({ killSignal: "SIGKILL" }).pipe(Effect.ignore),
              ),
            ),
          ),
        )
      }
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
    if (stop) {
      const session = control.session
      if (session !== undefined && control.fiber !== undefined) {
        yield* Fiber.join(control.fiber).pipe(Effect.ignore)
      }
      if (session !== undefined) {
        yield* closeSession(session)
      }
    }
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
    yield* userInputs.resolve(threadId, requestId, answers)
  })

  const drain = Effect.gen(function* () {
    while (turnFibers.size > 0) {
      const entries = [...turnFibers.entries()]
      yield* Effect.forEach(entries, ([, fiber]) => Fiber.join(fiber).pipe(Effect.ignoreCause), {
        discard: true,
      })
      for (const [id, fiber] of entries) {
        if (turnFibers.get(id) === fiber) {
          turnFibers.delete(id)
        }
      }
    }
  })

  const stopAll = Effect.sync(() => [...sessions.values()]).pipe(
    Effect.flatMap((current) => Effect.forEach(current, closeSession, { discard: true })),
    Effect.ignore,
  )

  const reapIdle = Effect.fn("CursorAdapter.reapIdle")(function* (
    threadId: ProviderTurnInput["threadId"],
  ) {
    const session = sessions.get(threadId)
    if (
      session === undefined ||
      session.stopped ||
      session.activeTurn !== undefined ||
      queued.has(threadId) ||
      active.has(threadId)
    ) {
      return false
    }
    yield* closeSession(session)
    return true
  })

  yield* Effect.addFinalizer(() => stopAll)

  return ProviderPort.of({
    status: Effect.succeed(
      singleInstanceStatuses(
        providerInstanceView({
          instanceId,
          driver: ProviderDriverKind.make("cursor"),
          enabled: true,
          probe: providerStatus,
        }),
      ),
    ),
    startTurn,
    interrupt: (threadId) => cancel(threadId, false),
    stop: (threadId) => cancel(threadId, true),
    reapIdle,
    stopAll,
    respondApproval,
    respondUserInput,
    drain,
  })
})

export const cursorProviderLayer = (options: CursorAdapterOptions = {}) =>
  Layer.effect(ProviderPort, makeCursorProvider(options)).pipe(
    Layer.provide(NodeServices.layer),
    Layer.provideMerge(turnUserInputRegistryLayer),
    Layer.provideMerge(threadLiveLayer),
  )
