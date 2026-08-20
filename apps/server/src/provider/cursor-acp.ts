import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { constants } from "node:fs"
import { access } from "node:fs/promises"
import { delimiter, join } from "node:path"

import type {
  ProviderApprovalDecision,
  ProviderUserInputAnswers,
} from "@noyau/protocol/entities/approvals"
import type { RuntimeMode } from "@noyau/protocol/entities/runtime-mode"
import { ApprovalRequestId, ProviderSessionId, ToolCallId } from "@noyau/protocol/ids"
import { Deferred, Effect, Fiber, Layer, Schema } from "effect"

import {
  AcpRequestError,
  AcpTransportError,
  makeAcpConnection,
  type AcpConnection,
  type AcpConnectionError,
} from "./acp-json-rpc"
import {
  ProviderPort,
  type ProviderEmit,
  type ProviderSignal,
  type ProviderTurnInput,
} from "./provider-port"

const ACP_VERSION = 1 as const
const CURSOR_AUTH_METHOD = "cursor_login"
const IMPLEMENT_MODE_ALIASES = ["code", "agent", "default", "chat", "implement"]
const APPROVAL_MODE_ALIASES = ["ask"]

const InitializeResponse = Schema.Struct({
  protocolVersion: Schema.Int,
  agentCapabilities: Schema.Struct({
    loadSession: Schema.Boolean,
  }),
})
const SessionMode = Schema.Struct({
  id: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  description: Schema.optionalKey(Schema.String),
})
const SessionModes = Schema.Struct({
  currentModeId: Schema.NonEmptyString,
  availableModes: Schema.Array(SessionMode),
})
const NewSessionResponse = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  modes: Schema.optionalKey(SessionModes),
  configOptions: Schema.optionalKey(Schema.Array(Schema.Unknown)),
})
const SessionSetupResponse = Schema.Struct({
  modes: Schema.optionalKey(SessionModes),
  configOptions: Schema.optionalKey(Schema.Array(Schema.Unknown)),
})
const PromptResponse = Schema.Struct({
  stopReason: Schema.Literals([
    "end_turn",
    "max_tokens",
    "max_turn_requests",
    "refusal",
    "cancelled",
  ]),
})
const SessionUpdate = Schema.Struct({
  _meta: Schema.optionalKey(
    Schema.Struct({
      isReplay: Schema.optionalKey(Schema.Boolean),
    }),
  ),
  sessionId: Schema.NonEmptyString,
  update: Schema.Struct({
    sessionUpdate: Schema.NonEmptyString,
  }),
})
const AssistantUpdate = Schema.Struct({
  sessionUpdate: Schema.Literal("agent_message_chunk"),
  content: Schema.Struct({
    type: Schema.Literal("text"),
    text: Schema.String,
  }),
})
const ToolUpdate = Schema.Struct({
  sessionUpdate: Schema.Literals(["tool_call", "tool_call_update"]),
  toolCallId: Schema.NonEmptyString,
  title: Schema.optionalKey(Schema.String),
  kind: Schema.optionalKey(Schema.String),
  status: Schema.optionalKey(Schema.Literals(["pending", "in_progress", "completed", "failed"])),
  rawOutput: Schema.optionalKey(Schema.Unknown),
})
const PlanUpdate = Schema.Struct({
  sessionUpdate: Schema.Literal("plan"),
  entries: Schema.Array(
    Schema.Struct({
      content: Schema.String,
      status: Schema.optionalKey(Schema.Literals(["pending", "in_progress", "completed"])),
    }),
  ),
})
const PermissionRequest = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  toolCall: Schema.Struct({
    toolCallId: Schema.NonEmptyString,
    title: Schema.optionalKey(Schema.String),
    kind: Schema.optionalKey(Schema.String),
  }),
  options: Schema.Array(
    Schema.Struct({
      optionId: Schema.NonEmptyString,
      kind: Schema.Literals(["allow_once", "allow_always", "reject_once", "reject_always"]),
    }),
  ),
})
const AskQuestionRequest = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  questions: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        prompt: Schema.optionalKey(Schema.NonEmptyString),
      }),
    ),
  ),
})

const decodeInitialize = Schema.decodeUnknownEffect(InitializeResponse)
const decodeNewSession = Schema.decodeUnknownEffect(NewSessionResponse)
const decodeSessionSetup = Schema.decodeUnknownEffect(SessionSetupResponse)
const decodePrompt = Schema.decodeUnknownEffect(PromptResponse)
const decodeSessionUpdate = Schema.decodeUnknownEffect(SessionUpdate)
const decodeAssistantUpdate = Schema.decodeUnknownEffect(AssistantUpdate)
const decodeToolUpdate = Schema.decodeUnknownEffect(ToolUpdate)
const decodePlanUpdate = Schema.decodeUnknownEffect(PlanUpdate)
const decodePermissionRequest = Schema.decodeUnknownEffect(PermissionRequest)
const decodeAskQuestionRequest = Schema.decodeUnknownEffect(AskQuestionRequest)

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
  connection?: AcpConnection
  child?: ChildProcessWithoutNullStreams
  sessionId?: string
  resumeSessionId?: string
  promptStarted: boolean
  cancelRequested: boolean
  stopRequested: boolean
  terminalEmitted: boolean
  fiber?: Fiber.Fiber<void>
}

const executableExists = (path: string, platform: NodeJS.Platform) =>
  Effect.tryPromise({
    try: () => access(path, platform === "win32" ? constants.F_OK : constants.X_OK),
    catch: (cause) =>
      new AcpTransportError({
        detail: `Cursor executable is not accessible at ${path}`,
        cause,
      }),
  }).pipe(
    Effect.as(true),
    Effect.orElseSucceed(() => false),
  )

/** Resolves the configured executable or the platform Cursor command on PATH. */
export const resolveCursorExecutable = Effect.fn("CursorAdapter.resolveExecutable")(function* (
  configuredPath: string | undefined,
  environment: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
) {
  const command = platform === "win32" ? "cursor-agent.exe" : "cursor-agent"
  const pathValue = environment.PATH ?? environment.Path ?? ""
  for (const directory of pathValue.split(delimiter)) {
    if (directory.trim().length === 0) {
      continue
    }
    const candidate = join(directory, command)
    if (yield* executableExists(candidate, platform)) {
      return candidate
    }
  }
  const configured = configuredPath?.trim()
  if (
    configured !== undefined &&
    configured.length > 0 &&
    (yield* executableExists(configured, platform))
  ) {
    return configured
  }
  return null
})

const mapSchemaError = (operation: string) => (cause: Schema.SchemaError) =>
  new AcpTransportError({
    detail: `Cursor ACP returned an invalid ${operation} response`,
    cause,
  })

const terminateChild = (child: ChildProcessWithoutNullStreams) =>
  Effect.callback<void>((resume) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resume(Effect.void)
      return
    }
    let finished = false
    const finish = () => {
      if (finished) {
        return
      }
      finished = true
      clearTimeout(forceTimer)
      resume(Effect.void)
    }
    child.once("exit", finish)
    child.kill("SIGTERM")
    const forceTimer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL")
      }
      finish()
    }, 2_000)
    return Effect.sync(() => {
      child.off("exit", finish)
      clearTimeout(forceTimer)
    })
  })

const spawnChild = Effect.fn("CursorAdapter.spawn")(function* (
  executable: string,
  args: ReadonlyArray<string>,
  cwd: string,
  environment: NodeJS.ProcessEnv,
) {
  return yield* Effect.acquireRelease(
    Effect.try({
      try: () => {
        const child = spawn(executable, [...args, "acp"], {
          cwd,
          env: environment,
          detached: false,
          windowsHide: true,
          stdio: ["pipe", "pipe", "pipe"],
        })
        child.on("error", () => {
          // The JSON-RPC reader turns the resulting pipe closure into the typed transport error.
        })
        return child
      },
      catch: (cause) =>
        new AcpTransportError({
          detail: `Failed to spawn Cursor ACP at ${executable}`,
          cause,
        }),
    }),
    terminateChild,
  )
})

const initialize = Effect.fn("CursorAdapter.initialize")(function* (
  connection: AcpConnection,
  clientVersion: string,
) {
  const raw = yield* connection.request("initialize", {
    protocolVersion: ACP_VERSION,
    clientCapabilities: {
      fs: { readTextFile: false, writeTextFile: false },
      terminal: false,
    },
    clientInfo: { name: "noyau", version: clientVersion },
  })
  const response = yield* decodeInitialize(raw).pipe(Effect.mapError(mapSchemaError("initialize")))
  if (response.protocolVersion !== ACP_VERSION || ! response.agentCapabilities.loadSession) {
    return yield* new AcpTransportError({
      detail: "Cursor ACP is missing protocol v1 or session/load capability",
    })
  }
  yield* connection.request("authenticate", { methodId: CURSOR_AUTH_METHOD })
  return response
})

const modeSearchText = (mode: (typeof SessionMode)["Type"]) =>
  `${mode.id} ${mode.name} ${mode.description ?? ""}`.toLowerCase()

const findMode = (
  modes: ReadonlyArray<(typeof SessionMode)["Type"]>,
  aliases: ReadonlyArray<string>,
) => {
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

const requestedMode = (
  runtimeMode: RuntimeMode,
  modes: (typeof SessionModes)["Type"] | undefined,
) => {
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
  options: (typeof PermissionRequest)["Type"]["options"],
) => {
  const kinds =
    decision === "acceptForSession"
      ? ["allow_always", "allow_once"]
      : decision === "accept"
        ? ["allow_once", "allow_always"]
        : ["reject_once", "reject_always"]
  if (decision === "cancel") {
    return { outcome: "cancelled" as const }
  }
  for (const kind of kinds) {
    const selected = options.find((option) => option.kind === kind)
    if (selected !== undefined) {
      return { outcome: "selected" as const, optionId: selected.optionId }
    }
  }
  return { outcome: "cancelled" as const }
}

const autoApproval = (options: (typeof PermissionRequest)["Type"]["options"]) => {
  const selected =
    options.find((option) => option.kind === "allow_always") ??
    options.find((option) => option.kind === "allow_once")
  return selected === undefined
    ? { outcome: "cancelled" as const }
    : { outcome: "selected" as const, optionId: selected.optionId }
}

const toolStatus = (status: (typeof ToolUpdate)["Type"]["status"]) => {
  switch (status) {
    case "completed":
      return "completed" as const
    case "failed":
      return "error" as const
    case "pending":
    case "in_progress":
    case undefined:
      return "in_progress" as const
  }
}

const errorDetail = (error: AcpConnectionError | AcpTransportError) =>
  error._tag === "AcpRequestError"
    ? `Cursor ACP ${error.method} failed (${error.code}): ${error.detail}`
    : error.detail

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

const makeCursorProvider = Effect.fn("CursorAdapter.make")(function* (
  options: CursorAdapterOptions = {},
) {
  const environment = options.environment ?? process.env
  const platform = options.platform ?? process.platform
  const configuredPath = options.binaryPath ?? environment.NOYAU_CURSOR_PATH
  const binaryArgs = options.binaryArgs ?? []
  const clientVersion = options.clientVersion ?? "0.0.0"
  const active = new Map<string, ActiveTurn>()

  const executable = yield* resolveCursorExecutable(configuredPath, environment, platform)

  const probe =
    executable === null
      ? Effect.succeed({ installed: false, handshakeOk: false })
      : Effect.scoped(
          Effect.gen(function* () {
            const child = yield* spawnChild(executable, binaryArgs, process.cwd(), environment)
            const connection = yield* makeAcpConnection(child, {
              notification: (_method, _params) => Effect.void,
              request: (_id, method, _params) =>
                Effect.fail(
                  new AcpRequestError({
                    method,
                    code: -32_601,
                    detail: `Unsupported probe request: ${method}`,
                  }),
                ),
            })
            yield* initialize(connection, clientVersion)
            return { installed: true, handshakeOk: true }
          }).pipe(Effect.catch(() => Effect.succeed({ installed: true, handshakeOk: false }))),
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
    requestId: string,
    params: Schema.Json | undefined,
  ) {
    const request = yield* decodePermissionRequest(params).pipe(
      Effect.mapError(mapSchemaError("session/request_permission")),
    )
    if (request.sessionId !== control.sessionId) {
      return yield* new AcpRequestError({
        method: "session/request_permission",
        code: -32_602,
        detail: "Permission request targets another Cursor session",
      })
    }
    yield* control.emit({
      _tag: "transcript",
      item: {
        _tag: "transcript.tool",
        threadId: control.input.threadId,
        turnId: control.input.turnId,
        toolCallId: ToolCallId.make(request.toolCall.toolCallId),
        name: request.toolCall.title ?? request.toolCall.kind ?? "Cursor tool",
        status: "in_progress",
      },
    })
    yield* emitPermission(control, requestId, "pending")

    const outcome =
      control.input.runtimeMode === "full-access"
        ? autoApproval(request.options)
        : yield* Effect.gen(function* () {
            const decision = yield* Deferred.make<ProviderApprovalDecision>()
            control.pendingApprovals.set(requestId, { decision })
            const selected = yield* Deferred.await(decision)
            control.pendingApprovals.delete(requestId)
            return approvalOutcome(selected, request.options)
          })
    yield* emitPermission(control, requestId, "resolved")
    return { outcome }
  })

  const handleAskQuestion = Effect.fn("CursorAdapter.handleAskQuestion")(function* (
    control: ActiveTurn,
    requestId: string,
    params: Schema.Json | undefined,
  ) {
    const request = yield* decodeAskQuestionRequest(params).pipe(
      Effect.mapError(mapSchemaError("cursor/ask_question")),
    )
    if (request.sessionId !== control.sessionId) {
      return yield* new AcpRequestError({
        method: "cursor/ask_question",
        code: -32_602,
        detail: "User-input request targets another Cursor session",
      })
    }
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
    const resolvedItem = { ...pendingItem, status: "resolved" as const }
    yield* control.emit({
      _tag: "transcript",
      item: resolvedItem,
    })
    const jsonAnswers = yield* Schema.decodeUnknownEffect(Schema.Json)(answers).pipe(
      Effect.mapError(mapSchemaError("cursor/ask_question answer")),
    )
    return { answers: jsonAnswers }
  })

  const handleUpdate = Effect.fn("CursorAdapter.handleUpdate")(function* (
    control: ActiveTurn,
    loading: () => boolean,
    params: Schema.Json | undefined,
  ) {
    const notification = yield* decodeSessionUpdate(params).pipe(
      Effect.mapError(mapSchemaError("session/update")),
    )
    const replayMetadata = notification["_meta"]
    if (loading() || replayMetadata?.isReplay === true || notification.sessionId !== control.sessionId) {
      return
    }
    switch (notification.update.sessionUpdate) {
      case "agent_message_chunk": {
        const update = yield* decodeAssistantUpdate(notification.update).pipe(
          Effect.mapError(mapSchemaError("assistant update")),
        )
        if (update.content.text.length > 0) {
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
        const update = yield* decodeToolUpdate(notification.update).pipe(
          Effect.mapError(mapSchemaError("tool update")),
        )
        const item = {
          _tag: "transcript.tool" as const,
          threadId: control.input.threadId,
          turnId: control.input.turnId,
          toolCallId: ToolCallId.make(update.toolCallId),
          name: update.title ?? update.kind ?? "Cursor tool",
          status: toolStatus(update.status),
        }
        yield* control.emit({
          _tag: "transcript",
          item:
            typeof update.rawOutput === "string"
              ? { ...item, outputSummary: update.rawOutput }
              : item,
        })
        return
      }
      case "plan": {
        const update = yield* decodePlanUpdate(notification.update).pipe(
          Effect.mapError(mapSchemaError("plan update")),
        )
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
          return yield* new AcpTransportError({
            detail: "Cursor provider is inactive: executable or required ACP capabilities missing",
          })
        }
        const child = yield* spawnChild(
          executable,
          binaryArgs,
          control.input.workspaceRoot,
          environment,
        )
        control.child = child
        let loading = false
        const connection = yield* makeAcpConnection(child, {
          notification: (method, params) =>
            method === "session/update"
              ? handleUpdate(control, () => loading, params)
              : Effect.void,
          request: (id, method, params) => {
            const requestId = String(id)
            if (method === "session/request_permission") {
              return handlePermission(control, requestId, params)
            }
            if (method === "cursor/ask_question") {
              return handleAskQuestion(control, requestId, params)
            }
            return Effect.fail(
              new AcpRequestError({
                method,
                code: -32_601,
                detail: `Unsupported Cursor ACP request: ${method}`,
              }),
            )
          },
        })
        control.connection = connection
        yield* initialize(connection, clientVersion)

        let setup: (typeof SessionSetupResponse)["Type"] | (typeof NewSessionResponse)["Type"]
        let sessionId: string
        const resumeSessionId = control.input.resumeCursor?.sessionId
        if (resumeSessionId !== undefined) {
          loading = true
          const loaded = yield* connection
            .request("session/load", {
              sessionId: resumeSessionId,
              cwd: control.input.workspaceRoot,
              mcpServers: [],
            })
            .pipe(
              Effect.flatMap((value) =>
                decodeSessionSetup(value).pipe(Effect.mapError(mapSchemaError("session/load"))),
              ),
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
            const created = yield* connection
              .request("session/new", {
                cwd: control.input.workspaceRoot,
                mcpServers: [],
              })
              .pipe(
                Effect.flatMap((value) =>
                  decodeNewSession(value).pipe(Effect.mapError(mapSchemaError("session/new"))),
                ),
              )
            setup = created
            sessionId = created.sessionId
          }
        } else {
          const created = yield* connection
            .request("session/new", {
              cwd: control.input.workspaceRoot,
              mcpServers: [],
            })
            .pipe(
              Effect.flatMap((value) =>
                decodeNewSession(value).pipe(Effect.mapError(mapSchemaError("session/new"))),
              ),
            )
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

        const mode = requestedMode(control.input.runtimeMode, setup.modes)
        if (mode !== undefined && mode !== setup.modes?.currentModeId) {
          yield* connection.request("session/set_config_option", {
            sessionId,
            configId: "mode",
            value: mode,
          })
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
        const response = yield* connection
          .request("session/prompt", {
            sessionId,
            prompt: [{ type: "text", text: control.input.text }],
          })
          .pipe(
            Effect.flatMap((value) =>
              decodePrompt(value).pipe(Effect.mapError(mapSchemaError("session/prompt"))),
            ),
            Effect.ensuring(Deferred.succeed(control.promptSettled, undefined)),
          )
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
        Effect.catch((error: AcpConnectionError | AcpTransportError) =>
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
    const fiber = yield* Effect.forkScoped(runTurn(control), { startImmediately: true })
    control.fiber = fiber
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
    if (
      !control.promptStarted ||
      control.connection === undefined ||
      control.sessionId === undefined
    ) {
      return
    }
    yield* control.connection
      .notify("session/cancel", { sessionId: control.sessionId })
      .pipe(Effect.catch(() => Effect.void))
    yield* Deferred.await(control.promptSettled).pipe(
      Effect.raceFirst(
        Effect.sleep("2 seconds").pipe(
          Effect.tap(() =>
            control.child === undefined
              ? Effect.void
              : Effect.sync(() => {
                  control.child?.kill("SIGKILL")
                }),
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
    const fibers = [...active.values()].flatMap((control) =>
      control.fiber === undefined ? [] : [control.fiber],
    )
    yield* Effect.forEach(fibers, Fiber.await, { discard: true })
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
  Layer.effect(ProviderPort, makeCursorProvider(options))
