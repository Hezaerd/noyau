import * as NodeServices from "@effect/platform-node/NodeServices"
import * as AcpClient from "@noyau/acp/client"
import * as AcpError from "@noyau/acp/errors"
import type * as AcpSchema from "@noyau/acp/schema"
import type {
  ProviderApprovalDecision,
  ProviderUserInputAnswers,
} from "@noyau/protocol/entities/approvals"
import type { RuntimeMode } from "@noyau/protocol/entities/runtime-mode"
import type { TranscriptTool } from "@noyau/protocol/entities/transcript"
import { ApprovalRequestId, ProviderSessionId, ToolCallId } from "@noyau/protocol/ids"
import { Deferred, Effect, Fiber, FileSystem, Layer, Path } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"

import { CursorAskQuestionRequest } from "./cursor-acp-extension.ts"
import {
  ProviderPort,
  type ProviderEmit,
  type ProviderSignal,
  type ProviderTurnInput,
} from "./provider-port.ts"
import { deriveToolCallPresentation, type ToolCallPresentation } from "./tool-call-presentation.ts"

const ACP_VERSION = 1 as const
const CURSOR_AUTH_METHOD = "cursor_login"
const IMPLEMENT_MODE_ALIASES = ["code", "agent", "default", "chat", "implement"]
const APPROVAL_MODE_ALIASES = ["ask"]

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
      ? Effect.succeed({ installed: false, handshakeOk: false })
      : Effect.scoped(
          Effect.gen(function* () {
            const { acp } = yield* openClient(process.cwd())
            yield* initialize(acp, clientVersion)
            return { installed: true, handshakeOk: true }
          }).pipe(Effect.catchCause(() => Effect.succeed({ installed: true, handshakeOk: false }))),
        )
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
        const response = yield* acp.agent
          .prompt({
            sessionId,
            prompt: [{ type: "text", text: control.input.text }],
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
