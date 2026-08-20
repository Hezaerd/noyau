import { appendFileSync } from "node:fs"
import { createInterface } from "node:readline"

const scenario = process.env.NOYAU_FAKE_ACP_SCENARIO ?? "success"
const requestLog = process.env.NOYAU_FAKE_ACP_REQUEST_LOG
const exitLog = process.env.NOYAU_FAKE_ACP_EXIT_LOG
const sessionId = process.env.NOYAU_FAKE_ACP_SESSION_ID ?? "fake-session-new"

const modes = {
  currentModeId: "agent",
  availableModes: [
    { id: "agent", name: "Agent" },
    { id: "ask", name: "Ask" },
    { id: "plan", name: "Plan" },
  ],
}

const write = (message) => {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

const respond = (id, result) => write({ jsonrpc: "2.0", id, result })
const fail = (id, message) => write({ jsonrpc: "2.0", id, error: { code: -32_603, message } })
const notify = (method, params) => write({ jsonrpc: "2.0", method, params })

const logRequest = (message) => {
  if (requestLog !== undefined) {
    appendFileSync(requestLog, `${JSON.stringify(message)}\n`, "utf8")
  }
}

const logExit = (reason) => {
  if (exitLog !== undefined) {
    appendFileSync(exitLog, `${reason}\n`, "utf8")
  }
}

let activePromptId
let activeSessionId = sessionId

process.once("SIGTERM", () => {
  logExit("SIGTERM")
  process.exit(0)
})
process.once("SIGINT", () => {
  logExit("SIGINT")
  process.exit(0)
})
process.once("exit", (code) => logExit(`exit:${code}`))

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
        { content: "Inspect state", status: "completed" },
        { content: "Implement change", status: "in_progress" },
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
      rawOutput: "done",
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
  logRequest(message)

  if (message.method === "initialize") {
    respond(message.id, {
      protocolVersion: scenario === "wrong-version" ? 2 : 1,
      agentCapabilities: {
        loadSession: scenario !== "missing-load",
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

  if (message.method === "session/new") {
    activeSessionId = sessionId
    respond(message.id, { sessionId, modes, configOptions: [] })
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
    respond(message.id, { modes, configOptions: [] })
    continue
  }

  if (message.method === "session/set_config_option") {
    respond(message.id, {})
    continue
  }

  if (message.method === "session/prompt") {
    activePromptId = message.id
    if (scenario === "rupture") {
      process.stderr.write("fake Cursor transport ruptured\n")
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
            { optionId: "once", kind: "allow_once" },
            { optionId: "always", kind: "allow_always" },
            { optionId: "reject", kind: "reject_once" },
          ],
        },
      })
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
