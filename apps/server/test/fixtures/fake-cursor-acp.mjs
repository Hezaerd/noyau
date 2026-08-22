import { createInterface } from "node:readline"

import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import { Config, Effect, FileSystem, ManagedRuntime, Option } from "effect"

const aboutArgs = process.argv.slice(2)
if (aboutArgs[0] === "about") {
  if (aboutArgs.includes("--format") && aboutArgs.includes("json")) {
    process.stdout.write(
      JSON.stringify({
        cliVersion: "2026.03.20-test",
        subscriptionTier: "Pro",
      }),
    )
  } else {
    process.stdout.write("CLI Version         2026.03.20-test\n")
  }
  process.exit(0)
}

const runtime = ManagedRuntime.make(NodeFileSystem.layer)
const { exitLog, fileSystem, requestLog, scenario, sessionId } = await runtime.runPromise(
  Effect.gen(function* () {
    return {
      scenario: yield* Config.string("NOYAU_FAKE_ACP_SCENARIO").pipe(Config.withDefault("success")),
      requestLog: yield* Config.option(Config.string("NOYAU_FAKE_ACP_REQUEST_LOG")),
      exitLog: yield* Config.option(Config.string("NOYAU_FAKE_ACP_EXIT_LOG")),
      sessionId: yield* Config.string("NOYAU_FAKE_ACP_SESSION_ID").pipe(
        Config.withDefault("fake-session-new"),
      ),
      fileSystem: yield* FileSystem.FileSystem,
    }
  }),
)

const modes = {
  currentModeId: "agent",
  availableModes: [
    { id: "agent", name: "Agent" },
    { id: "ask", name: "Ask" },
    { id: "plan", name: "Plan" },
  ],
}

const reasoningOption = {
  type: "select",
  id: "effort",
  name: "Reasoning effort",
  category: "thought_level",
  currentValue: "medium",
  options: [
    { value: "low", name: "Low" },
    { value: "medium", name: "Medium" },
    { value: "high", name: "High" },
  ],
}

const modelOption = {
  type: "select",
  id: "model",
  name: "Model",
  category: "model",
  currentValue: "composer-2.5",
  options: [
    { value: "composer-2.5", name: "Composer 2.5" },
    { value: "composer-2.5-fast", name: "Composer 2.5 Fast" },
  ],
}

const configOptions = [modelOption, reasoningOption]

const write = (message) => {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

const respond = (id, result) => write({ jsonrpc: "2.0", id, result })
const fail = (id, message) => write({ jsonrpc: "2.0", id, error: { code: -32_603, message } })
const notify = (method, params) => write({ jsonrpc: "2.0", method, params })

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

let activePromptId
let activeSessionId = sessionId

process.once("SIGTERM", () => {
  shutdown("SIGTERM")
})
process.once("SIGINT", () => {
  shutdown("SIGINT")
})

const emitLiveUpdates = () => {
  notify("session/update", {
    sessionId: activeSessionId,
    update: {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "hello from fake Cursor" },
    },
  })
  notify("session/update", {
    sessionId: activeSessionId,
    update: {
      sessionUpdate: "plan",
      entries: [
        { content: "Inspect state", priority: "medium", status: "completed" },
        { content: "Implement change", priority: "high", status: "in_progress" },
      ],
    },
  })
  notify("session/update", {
    sessionId: activeSessionId,
    update: {
      sessionUpdate: "tool_call",
      toolCallId: "fake-tool-1",
      title: "Inspect files",
      kind: "search",
      status: "in_progress",
      rawInput: { query: "mentions légales" },
    },
  })
  notify("session/update", {
    sessionId: activeSessionId,
    update: {
      sessionUpdate: "tool_call_update",
      toolCallId: "fake-tool-1",
      title: "Inspect files",
      kind: "search",
      status: "completed",
      rawInput: { query: "mentions légales" },
      rawOutput: { content: '---\\nimport PageHero from \\"../components/PageHero.astro\\"\\n' },
    },
  })
}

const completePrompt = (stopReason = "end_turn") => {
  if (activePromptId !== undefined) {
    respond(activePromptId, { stopReason })
    activePromptId = undefined
  }
}

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity })
for await (const line of lines) {
  const message = JSON.parse(line)
  await Effect.runPromise(logRequest(message))

  if (message.method === "initialize") {
    respond(message.id, {
      protocolVersion: scenario === "wrong-version" ? 2 : 1,
      agentCapabilities: {
        loadSession: scenario !== "missing-load",
        mcpCapabilities: {
          http: scenario !== "missing-mcp-http",
          sse: false,
        },
      },
    })
    continue
  }

  if (message.method === "authenticate") {
    if (scenario === "auth-fail") {
      fail(message.id, "cursor_login unavailable")
    } else {
      respond(message.id, {})
    }
    continue
  }

  if (message.method === "cursor/list_available_models") {
    respond(message.id, {
      models: [
        {
          value: "composer-2.5",
          name: "Composer 2.5",
          configOptions: [reasoningOption],
        },
        {
          value: "composer-2.5-fast",
          name: "Composer 2.5 Fast",
          configOptions: [reasoningOption],
        },
      ],
    })
    continue
  }

  if (message.method === "session/new") {
    activeSessionId = sessionId
    respond(message.id, { sessionId, modes, configOptions })
    continue
  }

  if (message.method === "session/load") {
    if (scenario === "load-fail") {
      fail(message.id, "unknown session")
      continue
    }
    activeSessionId = message.params.sessionId
    notify("session/update", {
      _meta: { isReplay: true },
      sessionId: activeSessionId,
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "replayed text must be ignored" },
      },
    })
    notify("session/update", {
      sessionId: activeSessionId,
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "load-gated text must be ignored" },
      },
    })
    respond(message.id, { modes, configOptions })
    continue
  }

  if (message.method === "session/set_config_option") {
    respond(message.id, { configOptions })
    continue
  }

  if (message.method === "session/prompt") {
    activePromptId = message.id
    if (scenario === "rupture") {
      process.stderr.write("fake Cursor transport ruptured\n")
      await Effect.runPromise(logExit("exit:17"))
      process.exit(17)
    }
    if (scenario === "permission") {
      write({
        jsonrpc: "2.0",
        id: 900,
        method: "session/request_permission",
        params: {
          sessionId: activeSessionId,
          toolCall: {
            toolCallId: "permission-tool",
            title: "Edit a file",
            kind: "edit",
          },
          options: [
            { optionId: "once", name: "Allow once", kind: "allow_once" },
            { optionId: "always", name: "Allow always", kind: "allow_always" },
            { optionId: "reject", name: "Reject", kind: "reject_once" },
          ],
        },
      })
      continue
    }
    if (scenario === "thread-title") {
      notify("session/update", {
        sessionId: activeSessionId,
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: '{"title":"Fix session resume"}' },
        },
      })
      completePrompt("end_turn")
      continue
    }
    if (scenario === "cancel" || scenario === "ignore-cancel") {
      notify("session/update", {
        sessionId: activeSessionId,
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "prompt-open" },
        },
      })
      continue
    }
    emitLiveUpdates()
    completePrompt(scenario === "non-end-turn" ? "refusal" : "end_turn")
    continue
  }

  if (message.method === "session/cancel") {
    if (scenario !== "ignore-cancel") {
      completePrompt("cancelled")
    }
    continue
  }

  if (message.id === 900) {
    emitLiveUpdates()
    completePrompt("end_turn")
    continue
  }

  if (message.id !== undefined) {
    fail(message.id, `unsupported method: ${String(message.method)}`)
  }
}

await Effect.runPromise(logExit("exit:0"))
