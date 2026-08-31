import {
  query,
  type CanUseTool,
  type Options as ClaudeQueryOptions,
  type PermissionMode,
  type PermissionResult,
  type SDKMessage,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk"
import * as NodeServices from "@effect/platform-node/NodeServices"
import type {
  ProviderApprovalDecision,
  ProviderUserInputAnswers,
} from "@noyau/contracts/entities/approvals"
import {
  emptyClaudeProviderStatus,
  instanceConfigBinaryPath,
  ProviderDriverKind,
  ProviderInstanceId,
  providerInstanceView,
  type CursorModel,
  type CursorReasoningEffort,
  type CursorServiceTier,
  type ProviderInstanceConfigBlob,
} from "@noyau/contracts/entities/environment"
import type { ModelSelection } from "@noyau/contracts/entities/model-selection"
import type { RuntimeMode } from "@noyau/contracts/entities/runtime-mode"
import type {
  TranscriptToolAction,
  TranscriptToolStatus,
} from "@noyau/contracts/entities/transcript"
import { ApprovalRequestId, ProviderSessionId, ToolCallId } from "@noyau/contracts/ids"
import { McpSessionRegistry } from "@noyau/server/mcp/mcp-session-registry"
import { ThreadLive, threadLiveLayer } from "@noyau/server/thread-live"
import {
  Data,
  Deferred,
  Effect,
  Exit,
  Fiber,
  FileSystem,
  Layer,
  Path,
  Queue,
  Scope,
  Stream,
} from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"

import { takeBufferedAssistantSpill } from "./assistant-delivery.ts"
import {
  extractAssistantText,
  extractPlanMarkdown,
  extractResultMessage,
  extractStreamText,
  extractToolResults,
  extractToolUses,
  mapAskUserQuestions,
  parseClaudeCliVersion,
  sessionIdOf,
} from "./claude-sdk-messages.ts"
import { promptContentBlocks } from "./prompt-blocks.ts"
import {
  ProviderPort,
  singleInstanceStatuses,
  type ProviderEmit,
  type ProviderSignal,
  type ProviderTurnInput,
} from "./provider-port.ts"
import { TurnUserInputRegistry, turnUserInputRegistryLayer } from "./turn-user-input-registry.ts"

class ClaudeAdapterFailure extends Data.TaggedError("ClaudeAdapterFailure")<{
  readonly message: string
}> {}

const SUPPORTED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"])

const MINIMUM_CLAUDE_OPUS_5_VERSION = "2.1.219"
const MINIMUM_CLAUDE_FABLE_5_VERSION = "2.1.169"
const MINIMUM_CLAUDE_OPUS_4_8_VERSION = "2.1.154"
const MINIMUM_CLAUDE_OPUS_4_7_VERSION = "2.1.111"

const XHIGH_MODELS = new Set([
  "claude-fable-5",
  "claude-opus-5",
  "claude-opus-4-8",
  "claude-sonnet-5",
])

const lowToMaxWithUltracode: ReadonlyArray<CursorReasoningEffort> = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High", isDefault: true },
  { value: "xhigh", label: "Extra High" },
  { value: "max", label: "Max" },
  {
    value: "ultracode",
    label: "Ultracode",
    description: "xhigh effort plus multi-agent workflow orchestration",
  },
  { value: "ultrathink", label: "Ultrathink" },
]

const opus47Efforts: ReadonlyArray<CursorReasoningEffort> = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "Extra High", isDefault: true },
  { value: "max", label: "Max" },
  { value: "ultrathink", label: "Ultrathink" },
]

const opus46Efforts: ReadonlyArray<CursorReasoningEffort> = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High", isDefault: true },
  { value: "max", label: "Max" },
  { value: "ultrathink", label: "Ultrathink" },
]

const opus45Efforts: ReadonlyArray<CursorReasoningEffort> = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High", isDefault: true },
  { value: "max", label: "Max" },
]

const sonnet5Efforts: ReadonlyArray<CursorReasoningEffort> = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High", isDefault: true },
  { value: "xhigh", label: "Extra High" },
  { value: "max", label: "Max" },
  { value: "ultrathink", label: "Ultrathink" },
]

const contextWindow = (defaultValue: "200k" | "1m"): ReadonlyArray<CursorServiceTier> => [
  defaultValue === "200k"
    ? { value: "200k", label: "200k", isDefault: true }
    : { value: "200k", label: "200k" },
  defaultValue === "1m"
    ? { value: "1m", label: "1M", isDefault: true }
    : { value: "1m", label: "1M" },
]

const CLAUDE_MODEL_CATALOG: ReadonlyArray<CursorModel> = [
  {
    modelId: "claude-fable-5",
    label: "Claude Fable 5",
    reasoningEfforts: lowToMaxWithUltracode,
    serviceTiers: contextWindow("1m"),
  },
  {
    modelId: "claude-opus-5",
    label: "Claude Opus 5",
    reasoningEfforts: lowToMaxWithUltracode,
    serviceTiers: contextWindow("1m"),
  },
  {
    modelId: "claude-opus-4-8",
    label: "Claude Opus 4.8",
    reasoningEfforts: lowToMaxWithUltracode,
    serviceTiers: [],
  },
  {
    modelId: "claude-opus-4-7",
    label: "Claude Opus 4.7",
    reasoningEfforts: opus47Efforts,
    serviceTiers: [],
  },
  {
    modelId: "claude-opus-4-6",
    label: "Claude Opus 4.6",
    reasoningEfforts: opus46Efforts,
    serviceTiers: contextWindow("1m"),
  },
  {
    modelId: "claude-opus-4-5",
    label: "Claude Opus 4.5",
    reasoningEfforts: opus45Efforts,
    serviceTiers: [],
  },
  {
    modelId: "claude-sonnet-5",
    label: "Claude Sonnet 5",
    reasoningEfforts: sonnet5Efforts,
    serviceTiers: contextWindow("200k"),
  },
  {
    modelId: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    reasoningEfforts: opus46Efforts,
    serviceTiers: contextWindow("200k"),
  },
  {
    modelId: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    reasoningEfforts: [],
    serviceTiers: [],
    thinking: { label: "Thinking", defaultValue: false },
  },
]

const semverParts = (value: string): ReadonlyArray<number> =>
  value.split(".").map((part) => Number.parseInt(part, 10) || 0)

const compareSemver = (left: string, right: string): number => {
  const leftParts = semverParts(left)
  const rightParts = semverParts(right)
  for (let index = 0; index < 3; index += 1) {
    const delta = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
    if (delta !== 0) {
      return delta
    }
  }
  return 0
}

const meetsMinimum = (version: string | null | undefined, minimum: string): boolean =>
  version === undefined || version === null || version.length === 0
    ? true
    : compareSemver(version, minimum) >= 0

export const claudeModelsForVersion = (
  version: string | null | undefined,
): ReadonlyArray<CursorModel> =>
  CLAUDE_MODEL_CATALOG.filter((model) => {
    if (model.modelId === "claude-opus-5") {
      return meetsMinimum(version, MINIMUM_CLAUDE_OPUS_5_VERSION)
    }
    if (model.modelId === "claude-fable-5") {
      return meetsMinimum(version, MINIMUM_CLAUDE_FABLE_5_VERSION)
    }
    if (model.modelId === "claude-opus-4-8") {
      return meetsMinimum(version, MINIMUM_CLAUDE_OPUS_4_8_VERSION)
    }
    if (model.modelId === "claude-opus-4-7") {
      return meetsMinimum(version, MINIMUM_CLAUDE_OPUS_4_7_VERSION)
    }
    return true
  })

const resolveClaudeModelId = (selection: ModelSelection | null | undefined): string | undefined => {
  const modelId = selection?.modelId
  if (modelId === undefined) {
    return undefined
  }
  return selection?.serviceTier === "1m" ? `${modelId}[1m]` : modelId
}

export interface ClaudeQueryRuntime extends AsyncIterable<SDKMessage> {
  readonly interrupt: () => Promise<void>
  readonly close: () => void
}

export interface ClaudeAdapterOptions {
  readonly instanceId?: ProviderInstanceId
  readonly instanceConfig?: ProviderInstanceConfigBlob | undefined
  readonly binaryPath?: string
  readonly environment?: NodeJS.ProcessEnv
  readonly platform?: NodeJS.Platform
  readonly createQuery?: (input: {
    readonly prompt: AsyncIterable<SDKUserMessage>
    readonly options: ClaudeQueryOptions
  }) => ClaudeQueryRuntime
  readonly probeStatus?: ClaudeProviderStatusOverride
}

type ClaudeProviderStatusOverride = {
  readonly installed: boolean
  readonly handshakeOk: boolean
  readonly version: string | null
  readonly plan: string | null
  readonly binaryPath: string | null
  readonly models?: ReadonlyArray<CursorModel>
}

interface PendingApproval {
  readonly decision: Deferred.Deferred<ProviderApprovalDecision>
}

interface ClaudeSessionConfig {
  readonly runtimeMode: ProviderTurnInput["runtimeMode"]
  readonly model: string | null
  readonly effort: ClaudeQueryOptions["effort"] | null
  readonly thinking: boolean | null
}

interface ClaudeSession {
  readonly threadId: ProviderTurnInput["threadId"]
  readonly projectId: ProviderTurnInput["projectId"]
  readonly workspaceRoot: string
  readonly config: ClaudeSessionConfig
  readonly scope: Scope.Closeable
  readonly promptQueue: Queue.Queue<SDKUserMessage | null>
  readonly query: ClaudeQueryRuntime
  resumeCursor: ProviderTurnInput["resumeCursor"]
  activeTurn: ActiveTurn | undefined
  streamFiber: Fiber.Fiber<void> | undefined
  stopped: boolean
}

interface ActiveTurn {
  readonly input: ProviderTurnInput
  readonly emit: ProviderEmit
  readonly promptSettled: Deferred.Deferred<void>
  readonly pendingApprovals: Map<string, PendingApproval>
  readonly live: ThreadLive["Service"]
  pendingAssistantText: string
  flushedAssistantText: string
  streamedAssistant: boolean
  session?: ClaudeSession
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

const flushAssistantText = Effect.fn("ClaudeAdapter.flushAssistantText")(function* (
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

const enqueueAssistantText = Effect.fn("ClaudeAdapter.enqueueAssistantText")(function* (
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

const emitSignal = Effect.fn("ClaudeAdapter.emitSignal")(function* (
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

export const resolveClaudeExecutable = Effect.fn("ClaudeAdapter.resolveExecutable")(function* (
  configuredPath: string | undefined,
  environment: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
) {
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const command = platform === "win32" ? "claude.exe" : "claude"
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

const makeResumeCursor = (sessionId: string): ProviderTurnInput["resumeCursor"] => ({
  schemaVersion: 1,
  sessionId: ProviderSessionId.make(sessionId),
})

const flattenPrompt = Effect.fn("ClaudeAdapter.flattenPrompt")(function* (
  input: ProviderTurnInput,
) {
  const blocks = yield* promptContentBlocks(input.text, input.workspaceRoot, input.tickets ?? [])
  return blocks
    .map((block) => {
      if (block.type === "text") {
        return block.text
      }
      if (block.type === "resource_link") {
        return block.uri
      }
      return ""
    })
    .join("")
})

const runtimeModeToPermission = (runtimeMode: RuntimeMode): PermissionMode | undefined => {
  switch (runtimeMode) {
    case "approval-required":
      return "default"
    case "auto-accept-edits":
      return "acceptEdits"
    case "auto":
      return "auto"
    case "full-access":
      return "bypassPermissions"
  }
}

const effortForModel = (
  modelId: string | undefined,
  effort: string | undefined,
): ClaudeQueryOptions["effort"] | undefined => {
  if (effort === undefined || effort === "ultrathink") {
    return undefined
  }
  const normalized = effort === "ultracode" ? "xhigh" : effort
  if (normalized === "xhigh" && (modelId === undefined || !XHIGH_MODELS.has(modelId))) {
    return "max"
  }
  if (normalized === "max" && modelId === "claude-sonnet-4-6") {
    return "high"
  }
  return normalized as ClaudeQueryOptions["effort"]
}

const sessionConfigOf = (input: ProviderTurnInput): ClaudeSessionConfig => ({
  runtimeMode: input.runtimeMode,
  model: resolveClaudeModelId(input.modelSelection) ?? null,
  effort:
    effortForModel(input.modelSelection?.modelId, input.modelSelection?.reasoningEffort) ?? null,
  thinking: input.modelSelection?.thinking ?? null,
})

const sameSessionConfig = (left: ClaudeSessionConfig, right: ClaudeSessionConfig): boolean =>
  left.runtimeMode === right.runtimeMode &&
  left.model === right.model &&
  left.effort === right.effort &&
  left.thinking === right.thinking

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

const probeClaudeCli = Effect.fn("ClaudeAdapter.probeCli")(function* (
  executable: string,
  environment: NodeJS.ProcessEnv,
) {
  const failed = {
    handshakeOk: false,
    version: null as string | null,
  }
  const probed = yield* Effect.scoped(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
      const handle = yield* spawner.spawn(
        ChildProcess.make(executable, ["--version"], {
          detached: false,
          windowsHide: true,
          env: environment,
          extendEnv: true,
        }),
      )
      const [stdout, stderr, code] = yield* Effect.all(
        [
          collectProcessText(handle.stdout),
          collectProcessText(handle.stderr),
          handle.exitCode.pipe(Effect.map(Number)),
        ],
        { concurrency: "unbounded" },
      )
      const version = parseClaudeCliVersion(`${stdout}\n${stderr}`)
      return code === 0 ? { handshakeOk: true, version } : { handshakeOk: false, version }
    }).pipe(
      Effect.timeout("5 seconds"),
      Effect.catchCause(() => Effect.succeed(failed)),
    ),
  )
  return probed
})

const toolAction = (toolName: string): TranscriptToolAction => {
  const normalized = toolName.toLowerCase()
  if (normalized.includes("bash") || normalized.includes("command") || normalized === "bash") {
    return "command"
  }
  if (
    normalized.includes("edit") ||
    normalized.includes("write") ||
    normalized.includes("read") ||
    normalized.includes("file")
  ) {
    return "file_change"
  }
  if (normalized.includes("search") || normalized.includes("web")) {
    return "search"
  }
  return "other"
}

const toTranscriptTool = (
  control: ActiveTurn,
  itemId: string,
  status: TranscriptToolStatus,
  name: string,
  action: TranscriptToolAction,
) => ({
  _tag: "transcript.tool" as const,
  threadId: control.input.threadId,
  turnId: control.input.turnId,
  toolCallId: ToolCallId.make(itemId),
  name,
  status,
  action,
})

type SessionSignal = Extract<ProviderSignal, { readonly _tag: "session" }>
type TurnEndedSignal = Extract<ProviderSignal, { readonly _tag: "turn-ended" }>

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

const turnEndedSignal = (
  control: ActiveTurn,
  state: TurnEndedSignal["state"],
  lastError?: string,
): ProviderSignal =>
  lastError === undefined
    ? {
        _tag: "turn-ended",
        threadId: control.input.threadId,
        turnId: control.input.turnId,
        state,
      }
    : {
        _tag: "turn-ended",
        threadId: control.input.threadId,
        turnId: control.input.turnId,
        state,
        lastError,
      }

const withActiveTurn = <A>(
  session: ClaudeSession,
  run: (control: ActiveTurn) => Effect.Effect<A>,
  fallback: Effect.Effect<A>,
) => {
  const control = session.activeTurn
  return control === undefined ? fallback : run(control)
}

const mapAskUserAnswers = (answers: ProviderUserInputAnswers) => {
  const entries: Array<readonly [string, string]> = []
  for (const [questionId, answer] of Object.entries(answers)) {
    const label = answer.optionIds[0] ?? answer.freeform
    if (label !== undefined && label.length > 0) {
      entries.push([questionId, label])
    }
  }
  return Object.fromEntries(entries)
}

type ClaudeUserTextBlock = {
  readonly type: "text"
  readonly text: string
}

type ClaudeUserImageBlock = {
  readonly type: "image"
  readonly source: {
    readonly type: "base64"
    readonly media_type: string
    readonly data: string
  }
}

type ClaudeUserContentBlock = ClaudeUserTextBlock | ClaudeUserImageBlock

const buildUserMessage = (content: ReadonlyArray<ClaudeUserContentBlock>): SDKUserMessage => ({
  type: "user",
  session_id: "",
  parent_tool_use_id: null,
  message: {
    role: "user",
    content: content as SDKUserMessage["message"]["content"],
  },
})

export const makeClaudeProvider = Effect.fn("ClaudeAdapter.make")(function* (
  options: ClaudeAdapterOptions = {},
) {
  const threadLive = yield* ThreadLive
  const providerScope = yield* Effect.scope
  const mcpSessions = yield* McpSessionRegistry
  const userInputs = yield* TurnUserInputRegistry
  const runtimeContext = yield* Effect.context()
  const runPromise = Effect.runPromiseWith(runtimeContext)
  const environment = options.environment ?? process.env
  const platform = options.platform ?? process.platform
  const instanceId = options.instanceId ?? ProviderInstanceId.make("claude")
  const configuredPath =
    environment.NOYAU_CLAUDE_PATH ??
    options.binaryPath ??
    instanceConfigBinaryPath(options.instanceConfig)
  const activeTurns = new Map<string, ActiveTurn>()
  const queued = new Map<string, ActiveTurn>()
  const sessions = new Map<string, ClaudeSession>()
  const turnFibers = new Map<string, Fiber.Fiber<void>>()

  const path = yield* Path.Path
  const executable = yield* resolveClaudeExecutable(configuredPath, environment, platform)
  const createQuery =
    options.createQuery ??
    ((input: {
      readonly prompt: AsyncIterable<SDKUserMessage>
      readonly options: ClaudeQueryOptions
    }) =>
      query({
        prompt: input.prompt,
        options: input.options,
      }) as ClaudeQueryRuntime)

  const providerStatus =
    options.probeStatus !== undefined
      ? {
          installed: options.probeStatus.installed,
          handshakeOk: options.probeStatus.handshakeOk,
          version: options.probeStatus.version,
          plan: options.probeStatus.plan,
          binaryPath: options.probeStatus.binaryPath,
          models: options.probeStatus.models ?? claudeModelsForVersion(options.probeStatus.version),
        }
      : executable === null
        ? emptyClaudeProviderStatus
        : yield* probeClaudeCli(executable, environment).pipe(
            Effect.map((probed) => ({
              installed: true,
              handshakeOk: probed.handshakeOk,
              version: probed.version,
              plan: null,
              binaryPath: executable,
              models: claudeModelsForVersion(probed.version),
            })),
          )

  const emitPermission = Effect.fn("ClaudeAdapter.emitPermission")(function* (
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

  const awaitApproval = Effect.fn("ClaudeAdapter.awaitApproval")(function* (
    control: ActiveTurn,
    requestId: string,
  ) {
    if (control.input.runtimeMode === "full-access") {
      yield* emitPermission(control, requestId, "pending")
      yield* emitPermission(control, requestId, "resolved")
      return "accept" as const
    }
    const decision = yield* Effect.acquireUseRelease(
      Effect.gen(function* () {
        const deferred = yield* Deferred.make<ProviderApprovalDecision>()
        control.pendingApprovals.set(requestId, { decision: deferred })
        return deferred
      }),
      (deferred) =>
        emitPermission(control, requestId, "pending").pipe(
          Effect.andThen(Deferred.await(deferred)),
        ),
      () =>
        Effect.sync(() => {
          control.pendingApprovals.delete(requestId)
        }),
    )
    yield* emitPermission(control, requestId, "resolved")
    return decision
  })

  const captureSessionId = (session: ClaudeSession, message: SDKMessage) =>
    Effect.sync(() => {
      const sessionId = sessionIdOf(message)
      if (sessionId !== undefined) {
        session.resumeCursor = makeResumeCursor(sessionId)
      }
    })

  const settleTurn = Effect.fn("ClaudeAdapter.settleTurn")(function* (
    control: ActiveTurn,
    state: TurnEndedSignal["state"],
    lastError?: string | null,
  ) {
    if (control.terminalEmitted) {
      return
    }
    control.terminalEmitted = true
    if (control.mcpActivated) {
      yield* mcpSessions.deactivateTurn(control.input.threadId, control.input.turnId)
      control.mcpActivated = false
    }
    const session = control.session
    if (session !== undefined) {
      session.activeTurn = undefined
    }
    const errorMessage =
      lastError !== undefined && lastError !== null && lastError !== "" ? lastError : undefined
    // turn.ended must land while Session is still `running`. A ready/error
    // session.set projects the Turn as settled, then requireRunningTurn
    // rejects the follow-up and this fiber never unblocks the next Turn.
    yield* emitSignal(control, turnEndedSignal(control, state, errorMessage)).pipe(
      Effect.andThen(
        emitSignal(
          control,
          sessionSignal(
            control,
            state === "error" ? "error" : "ready",
            session?.resumeCursor ?? control.input.resumeCursor,
            errorMessage,
          ),
        ),
      ),
      Effect.ensuring(Deferred.succeed(control.promptSettled, undefined)),
    )
    yield* userInputs.unbindTurn(control.input.threadId)
    yield* threadLive.clear(control.input.threadId)
  })

  const handleMessage = Effect.fn("ClaudeAdapter.handleMessage")(function* (
    session: ClaudeSession,
    message: SDKMessage,
  ) {
    yield* captureSessionId(session, message)
    yield* withActiveTurn(
      session,
      (control) =>
        Effect.gen(function* () {
          const streamText = extractStreamText(message)
          if (streamText.length > 0) {
            control.streamedAssistant = true
            yield* enqueueAssistantText(control, streamText)
          }
          const assistantText = extractAssistantText(message)
          if (assistantText.length > 0 && !control.streamedAssistant) {
            yield* enqueueAssistantText(control, assistantText)
          }
          for (const tool of extractToolUses(message)) {
            yield* emitSignal(control, {
              _tag: "transcript",
              item: toTranscriptTool(
                control,
                tool.id,
                "in_progress",
                tool.name,
                toolAction(tool.name),
              ),
            })
          }
          for (const result of extractToolResults(message)) {
            yield* emitSignal(control, {
              _tag: "transcript",
              item: toTranscriptTool(
                control,
                result.id,
                result.isError ? "error" : "completed",
                "tool",
                "other",
              ),
            })
          }
          const result = extractResultMessage(message)
          if (result === undefined) {
            return
          }
          const interrupted =
            control.cancelRequested ||
            control.stopRequested ||
            (result.subtype === "error_during_execution" &&
              result.errors.some((error) => error.toLowerCase().includes("interrupt")))
          const failed = result.subtype !== "success" && !interrupted
          const errorMessage =
            result.subtype === "success"
              ? result.isError
                ? result.result
                : undefined
              : result.errors[0]
          yield* settleTurn(
            control,
            interrupted ? "interrupted" : failed ? "error" : "completed",
            errorMessage,
          )
        }),
      Effect.void,
    )
  })

  const closeSession = Effect.fn("ClaudeAdapter.closeSession")(function* (session: ClaudeSession) {
    if (session.stopped) {
      return
    }
    session.stopped = true
    if (sessions.get(session.threadId) === session) {
      sessions.delete(session.threadId)
    }
    yield* mcpSessions.revokeSession(session.threadId)
    yield* Queue.offer(session.promptQueue, null).pipe(Effect.ignore)
    yield* Effect.try({
      try: () => {
        session.query.close()
      },
      catch: () => undefined,
    }).pipe(Effect.ignore)
    if (session.streamFiber !== undefined) {
      yield* Fiber.interrupt(session.streamFiber).pipe(Effect.ignore)
    }
    yield* Scope.close(session.scope, Exit.void).pipe(Effect.ignore)
  })

  const openSession = Effect.fn("ClaudeAdapter.openSession")(function* (control: ActiveTurn) {
    if (executable === null && options.createQuery === undefined) {
      return yield* new ClaudeAdapterFailure({ message: "Claude executable missing" })
    }
    if (!providerStatus.handshakeOk) {
      return yield* new ClaudeAdapterFailure({ message: "Claude handshake failed" })
    }
    const scope = yield* Scope.make("sequential")
    let transferred = false
    let released = false
    const releaseUntransferred = Effect.suspend(() => {
      if (transferred || released) {
        return Effect.void
      }
      released = true
      return mcpSessions
        .revokeSession(control.input.threadId)
        .pipe(Effect.andThen(Scope.close(scope, Exit.void)), Effect.ignore)
    })
    yield* Effect.addFinalizer(() => releaseUntransferred)
    const credential = yield* mcpSessions.issue({
      projectId: control.input.projectId,
      threadId: control.input.threadId,
    })
    const promptQueue = yield* Queue.unbounded<SDKUserMessage | null>()
    const prompt = Stream.fromQueue(promptQueue).pipe(
      Stream.takeWhile((item) => item !== null),
      Stream.map((item) => item),
      Stream.toAsyncIterable,
    )
    const permissionMode = runtimeModeToPermission(control.input.runtimeMode)
    const modelId = resolveClaudeModelId(control.input.modelSelection)
    const effort = effortForModel(
      control.input.modelSelection?.modelId,
      control.input.modelSelection?.reasoningEffort,
    )
    const queryOptions: ClaudeQueryOptions = {
      cwd: control.input.workspaceRoot,
      ...(executable !== null ? { pathToClaudeCodeExecutable: executable } : {}),
      systemPrompt: { type: "preset", preset: "claude_code" },
      settingSources: ["user", "project", "local"],
      includePartialMessages: true,
      canUseTool: canUseToolForThread(control.input.threadId),
      env: environment,
      additionalDirectories: [control.input.workspaceRoot],
      mcpServers: {
        noyau: {
          type: "http",
          url: credential.config.endpoint,
          headers: {
            Authorization: credential.config.authorizationHeader,
          },
        },
      },
      ...(modelId !== undefined ? { model: modelId } : {}),
      ...(effort !== undefined ? { effort } : {}),
      ...(permissionMode !== undefined ? { permissionMode } : {}),
      ...(permissionMode === "bypassPermissions" ? { allowDangerouslySkipPermissions: true } : {}),
      ...(control.input.resumeCursor?.sessionId !== undefined
        ? { resume: control.input.resumeCursor.sessionId }
        : {}),
      ...(control.input.modelSelection?.thinking !== undefined
        ? { settings: { alwaysThinkingEnabled: control.input.modelSelection.thinking } }
        : {}),
    }

    const queryRuntime = yield* Effect.try({
      try: () =>
        createQuery({
          prompt,
          options: queryOptions,
        }),
      catch: (cause) =>
        new ClaudeAdapterFailure({
          message: `Failed to start Claude runtime session: ${String(cause)}`,
        }),
    }).pipe(Effect.onError(() => releaseUntransferred))

    const session: ClaudeSession = {
      threadId: control.input.threadId,
      projectId: control.input.projectId,
      workspaceRoot: control.input.workspaceRoot,
      config: sessionConfigOf(control.input),
      scope,
      promptQueue,
      query: queryRuntime,
      resumeCursor: control.input.resumeCursor,
      activeTurn: control,
      streamFiber: undefined,
      stopped: false,
    }
    sessions.set(control.input.threadId, session)
    transferred = true

    const streamFiber = yield* Effect.forkIn(
      Stream.fromAsyncIterable(
        queryRuntime,
        (cause) => new ClaudeAdapterFailure({ message: String(cause) }),
      ).pipe(
        Stream.runForEach((message) => handleMessage(session, message)),
        Effect.catchCause((cause) =>
          withActiveTurn(
            session,
            (turn) => settleTurn(turn, "error", cause.toString()),
            Effect.void,
          ),
        ),
        Effect.ensuring(
          withActiveTurn(
            session,
            (turn) =>
              turn.terminalEmitted
                ? Effect.void
                : settleTurn(
                    turn,
                    turn.cancelRequested ? "interrupted" : "error",
                    "Claude stream ended.",
                  ),
            Effect.void,
          ),
        ),
      ),
      scope,
      { startImmediately: true },
    )
    session.streamFiber = streamFiber
    return session
  })

  const canUseToolForThread =
    (threadId: ProviderTurnInput["threadId"]): CanUseTool =>
    (toolName, toolInput, callbackOptions) => {
      const session = sessions.get(threadId)
      if (session === undefined) {
        return Promise.resolve({
          behavior: "deny",
          message: "Claude session is unavailable.",
        } satisfies PermissionResult)
      }
      return runPromise(
        withActiveTurn(
          session,
          (control) =>
            Effect.gen(function* () {
              if (toolName === "AskUserQuestion") {
                const requestId = ApprovalRequestId.make(
                  callbackOptions.toolUseID ?? `ask-${control.input.turnId}`,
                )
                const questions = mapAskUserQuestions(toolInput)
                const request = {
                  threadId: control.input.threadId,
                  turnId: control.input.turnId,
                  requestId,
                  ...(questions[0] !== undefined ? { prompt: questions[0].prompt } : {}),
                  ...(questions.length > 0 ? { questions } : {}),
                }
                const answers = yield* userInputs
                  .request(request)
                  .pipe(Effect.orElseSucceed(() => ({})))
                return {
                  behavior: "allow",
                  updatedInput: {
                    questions: toolInput.questions,
                    answers: mapAskUserAnswers(answers),
                  },
                } satisfies PermissionResult
              }
              if (toolName === "ExitPlanMode") {
                const markdown = extractPlanMarkdown(toolInput)
                if (markdown !== undefined) {
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
                return {
                  behavior: "deny",
                  message:
                    "The client captured your proposed plan. Stop here and wait for the user's feedback.",
                } satisfies PermissionResult
              }
              const decision = yield* awaitApproval(control, callbackOptions.toolUseID ?? toolName)
              if (decision === "accept" || decision === "acceptForSession") {
                return {
                  behavior: "allow",
                  updatedInput: toolInput,
                  ...(decision === "acceptForSession"
                    ? {
                        updatedPermissions: [
                          {
                            type: "addRules",
                            rules: [{ toolName }],
                            behavior: "allow",
                            destination: "session",
                          },
                        ],
                      }
                    : {}),
                } satisfies PermissionResult
              }
              return {
                behavior: "deny",
                message:
                  decision === "cancel"
                    ? "User cancelled tool execution."
                    : "User declined tool execution.",
              } satisfies PermissionResult
            }),
          Effect.succeed({
            behavior: "deny",
            message: "Claude session has no active turn.",
          } satisfies PermissionResult),
        ),
      )
    }

  const runTurn = Effect.fn("ClaudeAdapter.runTurn")(function* (control: ActiveTurn) {
    let session = sessions.get(control.input.threadId)
    if (
      session !== undefined &&
      !session.stopped &&
      (session.projectId !== control.input.projectId ||
        session.workspaceRoot !== control.input.workspaceRoot ||
        !sameSessionConfig(session.config, sessionConfigOf(control.input)))
    ) {
      const resumeCursor = session.resumeCursor
      yield* closeSession(session)
      session = yield* openSession({
        ...control,
        input: {
          ...control.input,
          resumeCursor: resumeCursor ?? control.input.resumeCursor,
        },
      })
    }

    if (session === undefined) {
      session = yield* openSession(control)
    }

    control.session = session
    session.activeTurn = control
    yield* userInputs.bindTurn(control.input.threadId, (signal) => emitSignal(control, signal))
    yield* mcpSessions.activateTurn(control.input.threadId, control.input.turnId)
    control.mcpActivated = true

    const prompt = yield* flattenPrompt(control.input).pipe(Effect.provideService(Path.Path, path))
    const content: Array<ClaudeUserContentBlock> = []
    if (prompt.length > 0) {
      content.push({ type: "text", text: prompt })
    }
    for (const attachment of control.input.attachments ?? []) {
      if (!SUPPORTED_IMAGE_MIME_TYPES.has(attachment.mimeType)) {
        return yield* settleTurn(
          control,
          "error",
          `Unsupported Claude image attachment type '${attachment.mimeType}'.`,
        )
      }
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: attachment.mimeType,
          data: Buffer.from(attachment.data).toString("base64"),
        },
      })
    }
    if (content.length === 0) {
      content.push({ type: "text", text: "" })
    }

    yield* emitSignal(control, {
      _tag: "session",
      threadId: control.input.threadId,
      turnId: control.input.turnId,
      status: "running",
      resumeCursor: session.resumeCursor,
    })
    yield* Queue.offer(session.promptQueue, buildUserMessage(content))
    yield* Deferred.await(control.promptSettled)
  })

  const startTurn = Effect.fn("ClaudeAdapter.startTurn")(function* (
    input: ProviderTurnInput,
    emit: ProviderEmit,
  ) {
    const promptSettled = yield* Deferred.make<void>()
    const control: ActiveTurn = {
      input,
      emit,
      promptSettled,
      pendingApprovals: new Map(),
      live: threadLive,
      pendingAssistantText: "",
      flushedAssistantText: "",
      streamedAssistant: false,
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
      if (queued.get(input.threadId) === undefined || queued.get(input.threadId) !== control) {
        return
      }
      queued.delete(input.threadId)
      activeTurns.set(input.threadId, control)
      yield* emitSignal(control, {
        _tag: "session",
        threadId: input.threadId,
        turnId: input.turnId,
        status: sessions.has(input.threadId) ? "running" : "starting",
        resumeCursor: sessions.get(input.threadId)?.resumeCursor ?? input.resumeCursor,
      })
      yield* runTurn(control).pipe(
        Effect.catchCause((cause) => settleTurn(control, "error", cause.toString())),
        Effect.ensuring(
          Effect.sync(() => {
            if (activeTurns.get(input.threadId) === control) {
              activeTurns.delete(input.threadId)
            }
          }),
        ),
      )
    })
    const fiber = yield* Effect.forkIn(
      Effect.scoped(runQueued),
      providerScope,
      previous === undefined ? { startImmediately: true } : undefined,
    )
    control.fiber = fiber
    turnFibers.set(input.threadId, fiber)
  })

  const cancel = Effect.fn("ClaudeAdapter.cancel")(function* (
    threadId: ProviderTurnInput["threadId"],
    stop: boolean,
  ) {
    const control = activeTurns.get(threadId) ?? queued.get(threadId)
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
    if (stop) {
      control.stopRequested = true
    }
    const session = control.session
    if (session !== undefined) {
      yield* Effect.tryPromise({
        try: () => session.query.interrupt(),
        catch: () => undefined,
      }).pipe(Effect.ignore)
    }
    if (stop && session !== undefined) {
      yield* closeSession(session)
    }
  })

  const respondApproval = Effect.fn("ClaudeAdapter.respondApproval")(function* (
    threadId: ProviderTurnInput["threadId"],
    requestId: ApprovalRequestId,
    decision: ProviderApprovalDecision,
  ) {
    const control = activeTurns.get(threadId)
    const pending = control?.pendingApprovals.get(requestId)
    if (pending === undefined) {
      return
    }
    yield* Deferred.succeed(pending.decision, decision)
  })

  const respondUserInput = Effect.fn("ClaudeAdapter.respondUserInput")(function* (
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

  const reapIdle = Effect.fn("ClaudeAdapter.reapIdle")(function* (
    threadId: ProviderTurnInput["threadId"],
  ) {
    const session = sessions.get(threadId)
    if (
      session === undefined ||
      session.stopped ||
      session.activeTurn !== undefined ||
      queued.has(threadId) ||
      activeTurns.has(threadId)
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
          driver: ProviderDriverKind.make("claude"),
          enabled: true,
          probe: providerStatus,
        }),
      ),
    ),
    startTurn: (input, emit) => startTurn(input, emit).pipe(Effect.provideService(Path.Path, path)),
    interrupt: (threadId) => cancel(threadId, false),
    stop: (threadId) => cancel(threadId, true),
    reapIdle,
    stopAll,
    respondApproval,
    respondUserInput,
    drain,
  })
})

export const claudeProviderLayer = (options: ClaudeAdapterOptions = {}) =>
  Layer.effect(ProviderPort, makeClaudeProvider(options)).pipe(
    Layer.provide(NodeServices.layer),
    Layer.provideMerge(turnUserInputRegistryLayer),
    Layer.provideMerge(threadLiveLayer),
  )
