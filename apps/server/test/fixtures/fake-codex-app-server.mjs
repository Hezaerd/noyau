import { createInterface } from "node:readline"

import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import { Config, Effect, FileSystem, ManagedRuntime, Option } from "effect"

const runtime = ManagedRuntime.make(NodeFileSystem.layer)
const { envToken, exitLog, fileSystem, requestLog, scenario, threadId } = await runtime.runPromise(
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
      envToken: yield* Config.option(Config.string("NOYAU_MCP_BEARER_TOKEN")),
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
    description: "GPT-4",
    displayName: "GPT-4",
    hidden: false,
    id: "gpt-4",
    isDefault: false,
    model: "gpt-4",
    supportedReasoningEfforts: [{ description: "Low", reasoningEffort: "low" }],
    upgrade: "gpt-5",
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
    envToken: Option.getOrNull(envToken),
  }),
)

let turnOrdinal = 0
const latestTurns = new Map()

const emitTurn = (requestThreadId, turnId) => {
  if (scenario === "cross-talk") {
    notify("item/agentMessage/delta", {
      delta: "child text that must stay isolated",
      itemId: "child-message",
      threadId: "child-codex-thread",
      turnId: "child-codex-turn",
    })
    notify("thread/tokenUsage/updated", {
      threadId: "child-codex-thread",
      turnId: "child-codex-turn",
      tokenUsage: {
        total: {
          inputTokens: 40,
          cachedInputTokens: 0,
          outputTokens: 10,
          reasoningOutputTokens: 0,
          totalTokens: 50,
        },
        last: {
          inputTokens: 40,
          cachedInputTokens: 0,
          outputTokens: 10,
          reasoningOutputTokens: 0,
          totalTokens: 50,
        },
        modelContextWindow: 100,
      },
    })
    notify("turn/completed", {
      threadId: "child-codex-thread",
      turn: { id: "child-codex-turn", items: [], status: "interrupted" },
    })
    notify("item/agentMessage/delta", {
      delta: "stale text that must stay isolated",
      itemId: "stale-message",
      threadId: requestThreadId,
      turnId: "stale-codex-turn",
    })
    notify("turn/completed", {
      threadId: requestThreadId,
      turn: { id: "stale-codex-turn", items: [], status: "interrupted" },
    })
  }
  if (scenario === "usage-burst") {
    for (let index = 1; index <= 10; index += 1) {
      notify("thread/tokenUsage/updated", {
        threadId: requestThreadId,
        turnId,
        tokenUsage: {
          total: {
            inputTokens: index,
            cachedInputTokens: 0,
            outputTokens: 0,
            reasoningOutputTokens: 0,
            totalTokens: index,
          },
          last: {
            inputTokens: index,
            cachedInputTokens: 0,
            outputTokens: 0,
            reasoningOutputTokens: 0,
            totalTokens: index,
          },
          modelContextWindow: 100,
        },
      })
    }
  }
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
  const latestTurn = { id: turnId, items: [], status: "completed" }
  latestTurns.set(requestThreadId, latestTurn)
  if (scenario !== "idle-without-turn-completed") {
    notify("turn/completed", {
      threadId: requestThreadId,
      turn: latestTurn,
    })
  }
}

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity })
for await (const line of lines) {
  const message = JSON.parse(line)
  await Effect.runPromise(logRequest(message))

  if (message.method === "initialize") {
    if (scenario === "exit-during-initialize") {
      shutdown("exit-during-initialize", 2)
      continue
    }
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

  if (message.method === "skills/list") {
    if (scenario === "skills-hang") {
      continue
    }
    const cwd = message.params?.cwds?.[0] ?? process.cwd()
    respond(message.id, {
      data: [
        {
          cwd,
          errors: [],
          skills: [
            {
              description: "Fallback description",
              enabled: true,
              interface: {
                displayName: "Test Skill",
                shortDescription: "Use the test workflow",
              },
              name: "test-skill",
              path: `${cwd}/.agents/skills/test-skill/SKILL.md`,
              scope: "repo",
            },
            {
              description: "No OpenAI metadata",
              enabled: true,
              name: "plain-skill",
              path: `${cwd}/.agents/skills/plain-skill/SKILL.md`,
              scope: "repo",
            },
            {
              description: "Disabled skill",
              enabled: false,
              name: "disabled-skill",
              path: `${cwd}/.agents/skills/disabled-skill/SKILL.md`,
              scope: "repo",
            },
          ],
        },
      ],
    })
    continue
  }

  if (message.method === "thread/start") {
    if (scenario === "exit-during-thread-start") {
      shutdown("exit-during-thread-start", 2)
      continue
    }
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

  if (message.method === "thread/fork") {
    const response = threadResponse(`forked-${message.params?.threadId ?? threadId}`)
    response.thread.turns = [
      {
        id:
          scenario === "fork-wrong-boundary"
            ? "wrong-fork-boundary"
            : (message.params?.lastTurnId ?? "missing-fork-boundary"),
        items: [],
        status: "completed",
      },
    ]
    respond(message.id, response)
    continue
  }

  if (message.method === "thread/read") {
    const requestedThreadId = message.params?.threadId ?? threadId
    const latestTurn = latestTurns.get(requestedThreadId) ?? null
    const thread = makeThread(requestedThreadId)
    thread.status =
      latestTurn?.status === "inProgress" ? { type: "active", activeFlags: [] } : { type: "idle" }
    thread.turns = message.params?.includeTurns === true && latestTurn !== null ? [latestTurn] : []
    respond(message.id, { thread })
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
    const latestTurn = { id: turnId, items: [], status: "inProgress" }
    latestTurns.set(requestThreadId, latestTurn)
    respond(message.id, { turn: latestTurn })
    if (scenario === "exit-active") {
      shutdown("active-exit", 2)
      continue
    }
    if (scenario !== "hang" && (scenario !== "hang-no-completion" || turnOrdinal > 1)) {
      setTimeout(() => emitTurn(requestThreadId, turnId), 0)
    }
    continue
  }

  if (message.method === "turn/interrupt") {
    const requestThreadId = message.params?.threadId ?? threadId
    const interruptedTurnId = message.params?.turnId ?? `fake-codex-turn-${turnOrdinal}`
    respond(message.id, {})
    if (scenario === "hang-no-completion") {
      continue
    }
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
