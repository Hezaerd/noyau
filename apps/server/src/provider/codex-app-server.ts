import * as NodeServices from "@effect/platform-node/NodeServices"
import * as CodexAppServerClient from "@noyau/codex/client"
import type * as CodexSchema from "@noyau/codex/schema"
import type {
  ProviderApprovalDecision,
  ProviderUserInputAnswers,
  UserInputQuestion,
} from "@noyau/contracts/entities/approvals"
import { contextUsageOf, type ContextUsage } from "@noyau/contracts/entities/context-usage"
import {
  emptyCodexProviderStatus,
  instanceConfigBinaryPath,
  ProviderDriverKind,
  ProviderInstanceId,
  providerInstanceView,
  type CursorModel,
  type CursorReasoningEffort,
  type CursorServiceTier,
  type ProviderInstanceConfigBlob,
} from "@noyau/contracts/entities/environment"
import type { RuntimeMode } from "@noyau/contracts/entities/runtime-mode"
import type {
  TranscriptToolAction,
  TranscriptToolStatus,
} from "@noyau/contracts/entities/transcript"
import { ApprovalRequestId, ProviderSessionId, ToolCallId } from "@noyau/contracts/ids"
import { McpSessionRegistry } from "@noyau/server/mcp/mcp-session-registry"
import { ThreadLive, threadLiveLayer } from "@noyau/server/thread-live"
import { Data, Deferred, Effect, Exit, Fiber, FileSystem, Layer, Option, Path, Scope } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"

import { takeBufferedAssistantSpill } from "./assistant-delivery.ts"
import { promptContentBlocks } from "./prompt-blocks.ts"
import {
  ProviderPort,
  singleInstanceStatuses,
  type ProviderEmit,
  type ProviderSignal,
  type ProviderTurnInput,
} from "./provider-port.ts"
import { TurnUserInputRegistry, turnUserInputRegistryLayer } from "./turn-user-input-registry.ts"

class CodexAdapterFailure extends Data.TaggedError("CodexAdapterFailure")<{
  readonly message: string
}> {}

const codexCall = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.catchCause((cause) =>
      Effect.fail(new CodexAdapterFailure({ message: cause.toString() })),
    ),
  )

const MCP_BEARER_ENV = "NOYAU_MCP_BEARER_TOKEN"
const CLIENT_INFO = {
  name: "noyau",
  title: "Noyau",
  version: "0.1.0",
} as const

export interface CodexAdapterOptions {
  readonly instanceId?: ProviderInstanceId
  readonly instanceConfig?: ProviderInstanceConfigBlob | undefined
  readonly binaryPath?: string
  readonly binaryArgs?: ReadonlyArray<string>
  readonly environment?: NodeJS.ProcessEnv
  readonly platform?: NodeJS.Platform
}

interface PendingApproval {
  readonly decision: Deferred.Deferred<ProviderApprovalDecision>
}

interface CodexSession {
  readonly threadId: ProviderTurnInput["threadId"]
  readonly projectId: ProviderTurnInput["projectId"]
  readonly workspaceRoot: string
  readonly scope: Scope.Closeable
  readonly client: CodexAppServerClient.CodexAppServerClient["Service"]
  readonly handle: ChildProcessSpawner.ChildProcessHandle
  providerThreadId: string
  resumeCursor: ProviderTurnInput["resumeCursor"]
  activeTurn: ActiveTurn | undefined
  lastEmit: ProviderEmit | undefined
  handlersBound: boolean
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
  session?: CodexSession
  providerTurnId?: string
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

const flushAssistantText = Effect.fn("CodexAdapter.flushAssistantText")(function* (
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

const enqueueAssistantText = Effect.fn("CodexAdapter.enqueueAssistantText")(function* (
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

const emitSignal = Effect.fn("CodexAdapter.emitSignal")(function* (
  control: ActiveTurn,
  signal: ProviderSignal,
) {
  yield* flushAssistantText(control)
  yield* control.emit(signal)
})

const emitContextUsage = (session: CodexSession, usage: ContextUsage) => {
  const control = session.activeTurn
  const emit = control?.emit ?? session.lastEmit
  if (emit === undefined) {
    return Effect.void
  }
  const signal = {
    _tag: "context-usage" as const,
    threadId: session.threadId,
    used: usage.used,
    window: usage.window,
  }
  return control === undefined ? emit(signal) : emitSignal(control, signal)
}

const executableExists = (fileSystem: FileSystem.FileSystem, candidate: string) =>
  fileSystem.access(candidate, { ok: true }).pipe(
    Effect.as(true),
    Effect.orElseSucceed(() => false),
  )

export const resolveCodexExecutable = Effect.fn("CodexAdapter.resolveExecutable")(function* (
  configuredPath: string | undefined,
  environment: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
) {
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const command = platform === "win32" ? "codex.exe" : "codex"
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

const runtimeModeToThreadConfig = (runtimeMode: RuntimeMode) => {
  switch (runtimeMode) {
    case "approval-required":
      return {
        approvalPolicy: "untrusted" as const,
        sandbox: "read-only" as const,
        approvalsReviewer: "user" as const,
      }
    case "auto-accept-edits":
      return {
        approvalPolicy: "on-request" as const,
        sandbox: "workspace-write" as const,
        approvalsReviewer: "user" as const,
      }
    case "auto":
      return {
        approvalPolicy: "on-request" as const,
        sandbox: "workspace-write" as const,
        approvalsReviewer: "auto_review" as const,
      }
    case "full-access":
      return {
        approvalPolicy: "never" as const,
        sandbox: "danger-full-access" as const,
        approvalsReviewer: "user" as const,
      }
  }
}

const runtimeModeToTurnSandboxPolicy = (runtimeMode: RuntimeMode) => {
  switch (runtimeMode) {
    case "approval-required":
      return { type: "readOnly" as const }
    case "auto-accept-edits":
    case "auto":
      return { type: "workspaceWrite" as const }
    case "full-access":
      return { type: "dangerFullAccess" as const }
  }
}

const makeResumeCursor = (providerThreadId: string): ProviderTurnInput["resumeCursor"] => ({
  schemaVersion: 1,
  sessionId: ProviderSessionId.make(providerThreadId),
})

const bytesToBase64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64")

const flattenPrompt = Effect.fn("CodexAdapter.flattenPrompt")(function* (input: ProviderTurnInput) {
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

const emptyModels: ReadonlyArray<CursorModel> = []

const mapCodexModels = (
  models: ReadonlyArray<CodexSchema.V2ModelListResponse__Model>,
): ReadonlyArray<CursorModel> =>
  models
    .filter((model) => !model.hidden)
    .map((model) => {
      const reasoningEfforts: Array<CursorReasoningEffort> = model.supportedReasoningEfforts.map(
        (effort) => {
          const mapped: CursorReasoningEffort = {
            value: effort.reasoningEffort,
            label: effort.reasoningEffort,
            description: effort.description,
          }
          return effort.reasoningEffort === model.defaultReasoningEffort
            ? Object.assign(mapped, { isDefault: true })
            : mapped
        },
      )
      const serviceTiers: Array<CursorServiceTier> = (model.serviceTiers ?? []).map((tier) => {
        const mapped: CursorServiceTier = {
          value: tier.id,
          label: tier.name,
        }
        return tier.id === model.defaultServiceTier
          ? Object.assign(mapped, { isDefault: true })
          : mapped
      })
      return {
        modelId: model.id,
        label: model.displayName,
        reasoningEfforts,
        serviceTiers,
      }
    })

const accountPlan = (account: CodexSchema.V2GetAccountResponse__Account | null | undefined) => {
  if (account === undefined || account === null) {
    return null
  }
  if (account.type === "chatgpt") {
    return account.planType
  }
  return account.type
}

const itemToolAction = (type: string): TranscriptToolAction => {
  switch (type) {
    case "commandExecution":
      return "command"
    case "fileChange":
      return "file_change"
    case "webSearch":
      return "search"
    default:
      return "other"
  }
}

const itemName = (item: { readonly type: string; readonly command?: string }): string =>
  item.command === undefined ? item.type : item.command

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
  session: CodexSession,
  run: (control: ActiveTurn) => Effect.Effect<A>,
  fallback: Effect.Effect<A>,
) => {
  const control = session.activeTurn
  return control === undefined ? fallback : run(control)
}

const threadStartParams = (input: ProviderTurnInput) => {
  const config = runtimeModeToThreadConfig(input.runtimeMode)
  const params = {
    cwd: input.workspaceRoot,
    approvalPolicy: config.approvalPolicy,
    sandbox: config.sandbox,
    approvalsReviewer: config.approvalsReviewer,
  }
  if (input.modelSelection === null) {
    return params
  }
  const withModel = Object.assign(params, { model: input.modelSelection.modelId })
  return input.modelSelection.serviceTier === undefined
    ? withModel
    : Object.assign(withModel, { serviceTier: input.modelSelection.serviceTier })
}

const turnStartParams = (
  control: ActiveTurn,
  providerThreadId: string,
  input: ReadonlyArray<CodexSchema.V2TurnStartParams__UserInput>,
) => {
  const config = runtimeModeToThreadConfig(control.input.runtimeMode)
  const params = {
    threadId: providerThreadId,
    input,
    approvalPolicy: config.approvalPolicy,
    approvalsReviewer: config.approvalsReviewer,
    sandboxPolicy: runtimeModeToTurnSandboxPolicy(control.input.runtimeMode),
  }
  if (control.input.modelSelection === null) {
    return params
  }
  const withModel = Object.assign(params, { model: control.input.modelSelection.modelId })
  const withEffort =
    control.input.modelSelection.reasoningEffort === undefined
      ? withModel
      : Object.assign(withModel, { effort: control.input.modelSelection.reasoningEffort })
  return control.input.modelSelection.serviceTier === undefined
    ? withEffort
    : Object.assign(withEffort, { serviceTier: control.input.modelSelection.serviceTier })
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

const mapUserInputAnswers = (answers: ProviderUserInputAnswers) => {
  const mapped: Record<string, { readonly answers: ReadonlyArray<string> }> = {}
  for (const [questionId, answer] of Object.entries(answers)) {
    const values = [...answer.optionIds]
    if (answer.freeform !== undefined) {
      values.push(answer.freeform)
    }
    mapped[questionId] = { answers: values }
  }
  return mapped
}

const mapUserInputQuestions = (
  questions: ReadonlyArray<CodexSchema.ToolRequestUserInputParams__ToolRequestUserInputQuestion>,
): ReadonlyArray<UserInputQuestion> | undefined => {
  const mapped = questions.flatMap((question) => {
    const options = (question.options ?? []).map((option) => ({
      id: option.label,
      label: option.label,
    }))
    if (options.length < 2) {
      return []
    }
    return [{ id: question.id, prompt: question.question, options }]
  })
  return mapped.length === 0 ? undefined : mapped
}

export const makeCodexProvider = Effect.fn("CodexAdapter.make")(function* (
  options: CodexAdapterOptions = {},
) {
  const threadLive = yield* ThreadLive
  const providerScope = yield* Effect.scope
  const mcpSessions = yield* McpSessionRegistry
  const userInputs = yield* TurnUserInputRegistry
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const environment = options.environment ?? process.env
  const platform = options.platform ?? process.platform
  const instanceId = options.instanceId ?? ProviderInstanceId.make("codex")
  const configuredPath =
    environment.NOYAU_CODEX_PATH ??
    options.binaryPath ??
    instanceConfigBinaryPath(options.instanceConfig)
  const binaryArgs = options.binaryArgs ?? []
  const active = new Map<string, ActiveTurn>()
  const queued = new Map<string, ActiveTurn>()
  const sessions = new Map<string, CodexSession>()
  const turnFibers = new Map<string, Fiber.Fiber<void>>()

  const path = yield* Path.Path
  const executable = yield* resolveCodexExecutable(configuredPath, environment, platform)

  const spawnHandle = Effect.fn("CodexAdapter.spawn")(function* (
    cwd: string,
    extraArgs: ReadonlyArray<string>,
    extraEnv: NodeJS.ProcessEnv,
    sessionScope?: Scope.Scope,
  ) {
    if (executable === null) {
      return yield* new CodexAdapterFailure({ message: "Codex executable missing" })
    }
    const spawned = spawner
      .spawn(
        ChildProcess.make(executable, [...binaryArgs, "app-server", ...extraArgs], {
          cwd,
          env: { ...environment, ...extraEnv },
          detached: false,
          windowsHide: true,
        }),
      )
      .pipe(
        Effect.mapError(
          (cause) =>
            new CodexAdapterFailure({
              message: `Failed to spawn Codex at ${executable}: ${cause.message}`,
            }),
        ),
      )
    return yield* sessionScope === undefined
      ? spawned
      : spawned.pipe(Effect.provideService(Scope.Scope, sessionScope))
  })

  const openClient = Effect.fn("CodexAdapter.openClient")(function* (
    cwd: string,
    extraArgs: ReadonlyArray<string> = [],
    extraEnv: NodeJS.ProcessEnv = {},
    sessionScope?: Scope.Scope,
  ) {
    const handle = yield* spawnHandle(cwd, extraArgs, extraEnv, sessionScope)
    const context = yield* sessionScope === undefined
      ? Layer.build(CodexAppServerClient.layerChildProcess(handle))
      : Layer.buildWithScope(CodexAppServerClient.layerChildProcess(handle), sessionScope)
    const client = yield* Effect.service(CodexAppServerClient.CodexAppServerClient).pipe(
      Effect.provideContext(context),
    )
    return { handle, client }
  })

  const initializeClient = (client: CodexAppServerClient.CodexAppServerClient["Service"]) =>
    Effect.gen(function* () {
      const initialized = yield* codexCall(
        client.request("initialize", {
          clientInfo: CLIENT_INFO,
          capabilities: { experimentalApi: true },
        }),
      )
      yield* codexCall(client.notify("initialized", undefined))
      return initialized
    })

  const probe =
    executable === null
      ? Effect.succeed(emptyCodexProviderStatus)
      : Effect.gen(function* () {
          const capabilities = yield* Effect.scoped(
            Effect.gen(function* () {
              const { client } = yield* openClient(process.cwd())
              const initialized = yield* initializeClient(client)
              const account = yield* codexCall(client.request("account/read", {})).pipe(
                Effect.orElseSucceed(() => ({ account: null, requiresOpenaiAuth: false })),
              )
              const listed = yield* codexCall(client.request("model/list", {})).pipe(
                Effect.orElseSucceed(() => ({ data: [] })),
              )
              return {
                handshakeOk: true,
                version: initialized.userAgent,
                plan: accountPlan(account.account),
                models: mapCodexModels(listed.data),
              }
            }).pipe(
              Effect.timeout("10 seconds"),
              Effect.catchCause(() =>
                Effect.succeed({
                  handshakeOk: false,
                  version: null,
                  plan: null,
                  models: emptyModels,
                }),
              ),
            ),
          )
          return {
            installed: true,
            handshakeOk: capabilities.handshakeOk,
            version: capabilities.version,
            plan: capabilities.plan,
            binaryPath: executable,
            models: capabilities.models,
          }
        })
  const providerStatus = yield* probe

  const emitPermission = Effect.fn("CodexAdapter.emitPermission")(function* (
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

  const awaitApproval = Effect.fn("CodexAdapter.awaitApproval")(function* (
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

  const bindHandlers = Effect.fn("CodexAdapter.bindHandlers")(function* (session: CodexSession) {
    yield* session.client.handleServerNotification("item/agentMessage/delta", (payload) =>
      withActiveTurn(
        session,
        (control) => enqueueAssistantText(control, payload.delta),
        Effect.void,
      ),
    )
    yield* session.client.handleServerNotification("item/started", (payload) => {
      if (payload.item.type === "agentMessage" || payload.item.type === "userMessage") {
        return Effect.void
      }
      return withActiveTurn(
        session,
        (control) =>
          emitSignal(control, {
            _tag: "transcript",
            item: toTranscriptTool(
              control,
              payload.item.id,
              "in_progress",
              itemName(payload.item),
              itemToolAction(payload.item.type),
            ),
          }),
        Effect.void,
      )
    })
    yield* session.client.handleServerNotification("item/completed", (payload) => {
      if (payload.item.type === "agentMessage" || payload.item.type === "userMessage") {
        return Effect.void
      }
      return withActiveTurn(
        session,
        (control) =>
          emitSignal(control, {
            _tag: "transcript",
            item: toTranscriptTool(
              control,
              payload.item.id,
              "completed",
              itemName(payload.item),
              itemToolAction(payload.item.type),
            ),
          }),
        Effect.void,
      )
    })
    yield* session.client.handleServerNotification("turn/plan/updated", (payload) => {
      const markdown = payload.plan
        .map((step) => `- [${step.status === "completed" ? "x" : " "}] ${step.step}`)
        .join("\n")
      if (markdown.trim() === "") {
        return Effect.void
      }
      return withActiveTurn(
        session,
        (control) =>
          emitSignal(control, {
            _tag: "transcript",
            item: {
              _tag: "transcript.plan",
              threadId: control.input.threadId,
              turnId: control.input.turnId,
              markdown,
            },
          }),
        Effect.void,
      )
    })
    yield* session.client.handleServerNotification("turn/completed", (payload) =>
      withActiveTurn(
        session,
        (control) => settleTurn(control, payload.turn.status, payload.turn.error?.message),
        Effect.void,
      ),
    )
    yield* session.client.handleServerNotification("thread/tokenUsage/updated", (payload) => {
      const usage = contextUsageOf(
        payload.tokenUsage.last.totalTokens,
        payload.tokenUsage.modelContextWindow ?? 0,
      )
      return usage === null ? Effect.void : emitContextUsage(session, usage)
    })
    yield* session.client.handleServerRequest("item/commandExecution/requestApproval", (payload) =>
      withActiveTurn(
        session,
        (control) =>
          awaitApproval(control, payload.itemId).pipe(Effect.map((decision) => ({ decision }))),
        Effect.succeed({ decision: "cancel" as const }),
      ),
    )
    yield* session.client.handleServerRequest("item/fileChange/requestApproval", (payload) =>
      withActiveTurn(
        session,
        (control) =>
          awaitApproval(control, payload.itemId).pipe(Effect.map((decision) => ({ decision }))),
        Effect.succeed({ decision: "cancel" as const }),
      ),
    )
    yield* session.client.handleServerRequest("item/tool/requestUserInput", (payload) =>
      withActiveTurn(
        session,
        (control) => {
          const requestId = ApprovalRequestId.make(payload.itemId)
          const questions = mapUserInputQuestions(payload.questions)
          const request = {
            threadId: control.input.threadId,
            turnId: control.input.turnId,
            requestId,
          }
          const prompt = payload.questions[0]?.question
          const title = payload.questions[0]?.header
          const withPrompt = prompt === undefined ? request : Object.assign(request, { prompt })
          const withTitle = title === undefined ? withPrompt : Object.assign(withPrompt, { title })
          const withQuestions =
            questions === undefined ? withTitle : Object.assign(withTitle, { questions })
          return userInputs.request(withQuestions).pipe(
            Effect.map((answers) => ({ answers: mapUserInputAnswers(answers) })),
            Effect.orElseSucceed(() => ({ answers: {} })),
          )
        },
        Effect.succeed({ answers: {} }),
      ),
    )
  })

  const closeSession = Effect.fn("CodexAdapter.closeSession")(function* (session: CodexSession) {
    if (session.stopped) {
      return
    }
    session.stopped = true
    if (sessions.get(session.threadId) === session) {
      sessions.delete(session.threadId)
    }
    yield* mcpSessions.revokeSession(session.threadId)
    yield* Scope.close(session.scope, Exit.void).pipe(Effect.ignore)
  })

  const settleTurn = Effect.fn("CodexAdapter.settleTurn")(function* (
    control: ActiveTurn,
    status: CodexSchema.V2TurnCompletedNotification__TurnStatus,
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
    const state =
      control.stopRequested || control.cancelRequested || status === "interrupted"
        ? "interrupted"
        : status === "failed"
          ? "error"
          : "completed"
    const session = control.session
    if (session !== undefined) {
      session.activeTurn = undefined
    }
    const errorMessage =
      lastError !== undefined && lastError !== null && lastError !== "" ? lastError : undefined
    yield* emitSignal(
      control,
      sessionSignal(
        control,
        state === "error" ? "error" : "ready",
        session?.resumeCursor ?? control.input.resumeCursor,
        errorMessage,
      ),
    )
    yield* emitSignal(control, turnEndedSignal(control, state, errorMessage))
    yield* Deferred.succeed(control.promptSettled, undefined)
    yield* userInputs.unbindTurn(control.input.threadId)
  })

  const openThread = Effect.fn("CodexAdapter.openThread")(function* (
    client: CodexAppServerClient.CodexAppServerClient["Service"],
    input: ProviderTurnInput,
  ) {
    const startParams = threadStartParams(input)
    const resumeId = input.resumeCursor?.sessionId
    if (resumeId !== undefined) {
      const resumed = yield* codexCall(
        client.request("thread/resume", Object.assign({}, startParams, { threadId: resumeId })),
      ).pipe(Effect.option)
      if (Option.isSome(resumed)) {
        return resumed.value.thread.id
      }
    }
    const started = yield* codexCall(client.request("thread/start", startParams))
    return started.thread.id
  })

  const runTurn = Effect.fn("CodexAdapter.runTurn")(function* (control: ActiveTurn) {
    let session = sessions.get(control.input.threadId)
    if (
      session !== undefined &&
      !session.stopped &&
      (session.projectId !== control.input.projectId ||
        session.workspaceRoot !== control.input.workspaceRoot)
    ) {
      yield* closeSession(session)
      session = undefined
    }
    if (session !== undefined && !session.stopped) {
      const running = yield* session.handle.isRunning.pipe(Effect.orElseSucceed(() => false))
      if (!running) {
        yield* closeSession(session)
        session = undefined
      }
    }

    let spawned = false
    if (session === undefined) {
      const scope = yield* Scope.make("sequential")
      const credential = yield* mcpSessions.issue({
        projectId: control.input.projectId,
        threadId: control.input.threadId,
      })
      const token = credential.config.authorizationHeader.replace(/^Bearer\s+/i, "")
      const opened = yield* openClient(
        control.input.workspaceRoot,
        [
          "-c",
          `mcp_servers.noyau.url=${credential.config.endpoint}`,
          "-c",
          `mcp_servers.noyau.bearer_token_env_var="${MCP_BEARER_ENV}"`,
        ],
        { [MCP_BEARER_ENV]: token },
        scope,
      )
      yield* initializeClient(opened.client)
      const providerThreadId = yield* openThread(opened.client, control.input)
      session = {
        threadId: control.input.threadId,
        projectId: control.input.projectId,
        workspaceRoot: control.input.workspaceRoot,
        scope,
        client: opened.client,
        handle: opened.handle,
        providerThreadId,
        resumeCursor: makeResumeCursor(providerThreadId),
        activeTurn: control,
        lastEmit: control.emit,
        handlersBound: false,
        stopped: false,
      }
      sessions.set(control.input.threadId, session)
      spawned = true
    }

    control.session = session
    session.activeTurn = control
    session.lastEmit = control.emit
    session.resumeCursor = makeResumeCursor(session.providerThreadId)
    if (!session.handlersBound) {
      yield* bindHandlers(session)
      session.handlersBound = true
    }
    yield* userInputs.bindTurn(control.input.threadId, (signal) => emitSignal(control, signal))
    yield* mcpSessions.activateTurn(control.input.threadId, control.input.turnId)
    control.mcpActivated = true
    // Reload only after spawn: a reused process already has the Noyau MCP
    // session, and a second reload can block turn/start forever.
    if (spawned) {
      yield* codexCall(session.client.request("config/mcpServer/reload", undefined)).pipe(
        Effect.timeout("8 seconds"),
        Effect.ignore,
      )
    }

    const prompt = yield* flattenPrompt(control.input).pipe(Effect.provideService(Path.Path, path))
    const turnInput: Array<CodexSchema.V2TurnStartParams__UserInput> = []
    if (prompt.length > 0) {
      turnInput.push({ type: "text", text: prompt })
    }
    for (const attachment of control.input.attachments ?? []) {
      turnInput.push({
        type: "image",
        url: `data:${attachment.mimeType};base64,${bytesToBase64(attachment.data)}`,
      })
    }
    const started = yield* codexCall(
      session.client.request(
        "turn/start",
        turnStartParams(control, session.providerThreadId, turnInput),
      ),
    )
    control.providerTurnId = started.turn.id
    yield* emitSignal(control, {
      _tag: "session",
      threadId: control.input.threadId,
      turnId: control.input.turnId,
      status: "running",
      resumeCursor: session.resumeCursor,
    })
    yield* Deferred.await(control.promptSettled)
  })

  const startTurn = Effect.fn("CodexAdapter.startTurn")(function* (
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
      active.set(input.threadId, control)
      yield* emitSignal(control, {
        _tag: "session",
        threadId: input.threadId,
        turnId: input.turnId,
        status: sessions.has(input.threadId) ? "running" : "starting",
        resumeCursor: sessions.get(input.threadId)?.resumeCursor ?? input.resumeCursor,
      })
      yield* runTurn(control).pipe(
        Effect.catchCause((cause) => settleTurn(control, "failed", cause.toString())),
        Effect.ensuring(
          Effect.sync(() => {
            if (active.get(input.threadId) === control) {
              active.delete(input.threadId)
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

  const cancel = Effect.fn("CodexAdapter.cancel")(function* (
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
    if (stop) {
      control.stopRequested = true
    }
    const session = control.session
    if (session !== undefined && control.providerTurnId !== undefined) {
      yield* codexCall(
        session.client.request("turn/interrupt", {
          threadId: session.providerThreadId,
          turnId: control.providerTurnId,
        }),
      ).pipe(Effect.ignore)
    }
    if (stop && session !== undefined) {
      yield* closeSession(session)
    }
  })

  const respondApproval = Effect.fn("CodexAdapter.respondApproval")(function* (
    threadId: ProviderTurnInput["threadId"],
    requestId: ApprovalRequestId,
    decision: ProviderApprovalDecision,
  ) {
    const control = active.get(threadId)
    const pending = control?.pendingApprovals.get(requestId)
    if (pending === undefined) {
      return
    }
    yield* Deferred.succeed(pending.decision, decision)
  })

  const respondUserInput = Effect.fn("CodexAdapter.respondUserInput")(function* (
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

  const reapIdle = Effect.fn("CodexAdapter.reapIdle")(function* (
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
          driver: ProviderDriverKind.make("codex"),
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

export const codexProviderLayer = (options: CodexAdapterOptions = {}) =>
  Layer.effect(ProviderPort, makeCodexProvider(options)).pipe(
    Layer.provide(NodeServices.layer),
    Layer.provideMerge(turnUserInputRegistryLayer),
    Layer.provideMerge(threadLiveLayer),
  )
