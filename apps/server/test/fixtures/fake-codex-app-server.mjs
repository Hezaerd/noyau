import { createInterface } from "node:readline"

import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import { Config, Effect, FileSystem, ManagedRuntime, Option } from "effect"

const runtime = ManagedRuntime.make(NodeFileSystem.layer)
const { exitLog, fileSystem, requestLog, scenario, threadId } = await runtime.runPromise(
  Effect.gen(function* () {
    return {
      scenario: yield* Config.string("NOYAU_FAKE_CODEX_SCENARIO").pipe(
        Config.withDefault("success"),
      ),
      requestLog: yield* Config.option(Config.string("NOYAU_FAKE_CODEX_REQUEST_LOG")),
      exitLog: yield* Config.option(Config.string("NOYAU_FAKE_CODEX_EXIT_LOG")),
      threadId: yield* Config.string("NOYAU_FAKE_CODEX_THREAD_ID").pipe(
        Config.withDefault("fake-codex-thread"),
      ),
      fileSystem: yield* FileSystem.FileSystem,
    }
  }),
)

const write = (message) => {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

const respond = (id, result) => write({ id, result })
const fail = (id, message) => write({ id, error: { code: -32_603, message } })
const notify = (method, params) => write({ method, params })

const appendLine = (path, line) => fileSystem.writeFileString(path, `${line}\n`, { flag: "a" })

const logRequest = (message) => {
  if (Option.isNone(requestLog)) {
    return Effect.void
  }
  return appendLine(requestLog.value, JSON.stringify(message))
}

const logExit = (reason) => {
  if (Option.isNone(exitLog)) {
    return Effect.void
  }
  return appendLine(exitLog.value, reason)
}

const shutdown = (reason, code = 0) => {
  void Effect.runPromise(logExit(reason)).finally(() => {
    process.exit(code)
  })
}

process.once("SIGTERM", () => {
  shutdown("SIGTERM")
})
process.once("SIGINT", () => {
  shutdown("SIGINT")
})

const makeThread = (id) => ({
  cliVersion: "0.0.0-test",
  createdAt: 0,
  cwd: process.cwd(),
  ephemeral: false,
  id,
  modelProvider: "openai",
  preview: "",
  sessionId: id,
  source: "appServer",
  status: { type: "idle" },
  turns: [],
  updatedAt: 0,
})

const threadResponse = (id) => ({
  approvalPolicy: "never",
  approvalsReviewer: "user",
  cwd: process.cwd(),
  model: "gpt-5",
  modelProvider: "openai",
  sandbox: { type: "dangerFullAccess" },
  thread: makeThread(id),
})

const models = [
  {
    defaultReasoningEffort: "medium",
    defaultServiceTier: "standard",
    description: "GPT-5",
    displayName: "GPT-5",
    hidden: false,
    id: "gpt-5",
    isDefault: true,
    model: "gpt-5",
    serviceTiers: [
      { description: "Standard", id: "standard", name: "Standard" },
      { description: "Fast", id: "fast", name: "Fast" },
    ],
    supportedReasoningEfforts: [
      { description: "Low", reasoningEffort: "low" },
      { description: "Medium", reasoningEffort: "medium" },
      { description: "High", reasoningEffort: "high" },
    ],
  },
  {
    defaultReasoningEffort: "low",
    description: "Hidden",
    displayName: "Hidden",
    hidden: true,
    id: "hidden-model",
    isDefault: false,
    model: "hidden-model",
    supportedReasoningEfforts: [{ description: "Low", reasoningEffort: "low" }],
  },
]

await Effect.runPromise(
  logRequest({
    method: "_spawn",
    argv: process.argv.slice(2),
    envToken: process.env.NOYAU_MCP_BEARER_TOKEN ?? null,
  }),
)

let turnOrdinal = 0

const emitTurn = (requestThreadId, turnId) => {
  notify("item/agentMessage/delta", {
    delta: "hello from fake Codex",
    itemId: "item-msg-1",
    threadId: requestThreadId,
    turnId,
  })
  notify("turn/plan/updated", {
    plan: [
      { status: "completed", step: "Inspect state" },
      { status: "inProgress", step: "Implement change" },
    ],
    threadId: requestThreadId,
    turnId,
  })
  notify("item/started", {
    item: {
      command: "ls",
      commandActions: [],
      cwd: process.cwd(),
      id: "item-cmd-1",
      status: "inProgress",
      type: "commandExecution",
    },
    startedAtMs: 1,
    threadId: requestThreadId,
    turnId,
  })
  notify("item/completed", {
    completedAtMs: 2,
    item: {
      command: "ls",
      commandActions: [],
      cwd: process.cwd(),
      id: "item-cmd-1",
      status: "completed",
      type: "commandExecution",
    },
    threadId: requestThreadId,
    turnId,
  })
  notify("item/started", {
    item: { id: "item-search-1", query: "mentions légales", type: "webSearch" },
    startedAtMs: 3,
    threadId: requestThreadId,
    turnId,
  })
  notify("item/completed", {
    completedAtMs: 4,
    item: { id: "item-search-1", query: "mentions légales", type: "webSearch" },
    threadId: requestThreadId,
    turnId,
  })
  notify("turn/completed", {
    threadId: requestThreadId,
    turn: { id: turnId, items: [], status: "completed" },
  })
}

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity })
for await (const line of lines) {
  const message = JSON.parse(line)
  await Effect.runPromise(logRequest(message))

  if (message.method === "initialize") {
    if (scenario === "handshake-fail") {
      fail(message.id, "initialize refused")
      continue
    }
    respond(message.id, {
      userAgent: "fake-codex-app-server",
      codexHome: process.cwd(),
      platformFamily: process.platform === "win32" ? "windows" : "unix",
      platformOs: process.platform === "darwin" ? "macos" : process.platform,
    })
    continue
  }

  if (message.method === "initialized") {
    continue
  }

  if (message.method === "account/read") {
    respond(message.id, {
      account: { type: "chatgpt", email: "fake@example.com", planType: "plus" },
      requiresOpenaiAuth: false,
    })
    continue
  }

  if (message.method === "model/list") {
    respond(message.id, { data: models })
    continue
  }

  if (message.method === "thread/start") {
    respond(message.id, threadResponse(threadId))
    continue
  }

  if (message.method === "thread/resume") {
    if (scenario === "resume-missing") {
      fail(message.id, "thread not found")
      continue
    }
    respond(message.id, threadResponse(message.params?.threadId ?? threadId))
    continue
  }

  if (message.method === "config/mcpServer/reload") {
    respond(message.id, {})
    continue
  }

  if (message.method === "turn/start") {
    turnOrdinal += 1
    const requestThreadId = message.params?.threadId ?? threadId
    const turnId = `fake-codex-turn-${turnOrdinal}`
    respond(message.id, { turn: { id: turnId, items: [], status: "inProgress" } })
    if (scenario !== "hang") {
      emitTurn(requestThreadId, turnId)
    }
    continue
  }

  if (message.method === "turn/interrupt") {
    const requestThreadId = message.params?.threadId ?? threadId
    const interruptedTurnId = message.params?.turnId ?? `fake-codex-turn-${turnOrdinal}`
    respond(message.id, {})
    notify("turn/completed", {
      threadId: requestThreadId,
      turn: { id: interruptedTurnId, items: [], status: "interrupted" },
    })
    continue
  }

  if (message.id !== undefined) {
    fail(message.id, `unhandled ${String(message.method)}`)
  }
}
