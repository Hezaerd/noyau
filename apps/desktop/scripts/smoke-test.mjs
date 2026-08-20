import { strict as assert } from "node:assert"
import * as NodeChildProcess from "node:child_process"
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import {
  durableJourney,
  readRecoveredJourney,
  resumeJourney,
  startInitialJourney,
} from "./durable-smoke-rpc.ts"
import { desktopDir, resolveElectronLaunchCommand } from "./electron-launcher.mjs"

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "server",
  "test",
  "fixtures",
  "fake-cursor-acp.mjs",
)
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

const parseRequestLog = async (requestLog) => {
  try {
    const contents = await readFile(requestLog, "utf8")
    return contents
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
  } catch (cause) {
    if (cause?.code === "ENOENT") {
      return []
    }
    throw cause
  }
}

const waitForControl = async (controlFile, predicate, label, attempts = 400) => {
  if (attempts <= 0) {
    throw new Error(`Timed out waiting for ${label}`)
  }
  try {
    const control = JSON.parse(await readFile(controlFile, "utf8"))
    if (predicate(control)) {
      return control
    }
  } catch (cause) {
    if (cause?.code !== "ENOENT" && !(cause instanceof SyntaxError)) {
      throw cause
    }
  }
  await delay(25)
  return waitForControl(controlFile, predicate, label, attempts - 1)
}

const boardContent = ({ snapshotSequence: _snapshotSequence, ...content }) => content
const transcriptTexts = (snapshot) =>
  snapshot.transcript.flatMap((item) => ("text" in item ? [item.text] : []))
const sessionRequests = (requests) =>
  requests.filter((request) => request.method?.startsWith("session/"))

const run = async () => {
  assert.notEqual(
    process.platform,
    "win32",
    "The destructive child restart smoke runs on macOS/Linux",
  )

  const temporaryDirectory = await mkdtemp(join(tmpdir(), "noyau-durable-smoke-"))
  const fakeBinDirectory = join(temporaryDirectory, "bin")
  const profileDirectory = join(temporaryDirectory, "profile")
  const workspaceRoot = join(temporaryDirectory, "project")
  const controlFile = join(temporaryDirectory, "supervisor.json")
  const completeFile = join(temporaryDirectory, "complete")
  const requestLog = join(temporaryDirectory, "acp-requests.ndjson")
  const fakeCursorAgent = join(fakeBinDirectory, "cursor-agent")
  let electronProcess
  let sentinelProcess
  let output = ""
  let shutdownEndpointRequestedAt

  try {
    await mkdir(fakeBinDirectory, { recursive: true })
    await mkdir(profileDirectory, { recursive: true })
    await mkdir(workspaceRoot, { recursive: true })
    const fakeSource = await readFile(fixturePath, "utf8")
    await writeFile(fakeCursorAgent, `#!/usr/bin/env node\n${fakeSource}`, "utf8")
    await chmod(fakeCursorAgent, 0o755)

    const fakeEnvironment = {
      ...process.env,
      PATH: `${fakeBinDirectory}:${process.env.PATH ?? ""}`,
      NOYAU_CURSOR_PATH: fakeCursorAgent,
      NOYAU_FAKE_ACP_SCENARIO: "cancel",
      NOYAU_FAKE_ACP_SESSION_ID: "durable-smoke-session",
    }
    sentinelProcess = NodeChildProcess.spawn(fakeCursorAgent, [], {
      env: fakeEnvironment,
      stdio: ["pipe", "ignore", "ignore"],
    })
    await delay(50)
    assert.equal(sentinelProcess.exitCode, null, "foreign cursor-agent sentinel must be alive")

    const electronArguments = [`--user-data-dir=${profileDirectory}`, "dist-electron/main.cjs"]
    const launch = resolveElectronLaunchCommand(electronArguments, false)
    const executable = process.platform === "linux" ? "xvfb-run" : launch.electronPath
    const executableArguments =
      process.platform === "linux"
        ? ["-a", launch.electronPath, "--no-sandbox", ...electronArguments]
        : launch.args
    const childEnvironment = {
      ...fakeEnvironment,
      NOYAU_DESKTOP_SMOKE_TEST: "1",
      NOYAU_DESKTOP_SMOKE_CONTROL_FILE: controlFile,
      NOYAU_DESKTOP_SMOKE_COMPLETE_FILE: completeFile,
      NOYAU_FAKE_ACP_REQUEST_LOG: requestLog,
    }
    delete childEnvironment.ELECTRON_RUN_AS_NODE

    electronProcess = NodeChildProcess.spawn(executable, executableArguments, {
      cwd: desktopDir,
      env: childEnvironment,
      stdio: ["ignore", "pipe", "pipe"],
    })
    electronProcess.stdout.on("data", (chunk) => {
      const text = chunk.toString()
      output += text
      if (
        shutdownEndpointRequestedAt === undefined &&
        text.includes("NOYAU_DESKTOP_SHUTDOWN_ENDPOINT_REQUESTED")
      ) {
        shutdownEndpointRequestedAt = performance.now()
      }
    })
    electronProcess.stderr.on("data", (chunk) => {
      output += chunk.toString()
    })
    const electronExit = new Promise((resolve) => {
      electronProcess.once("exit", (code, signal) => resolve({ code, signal }))
    })
    const timeout = setTimeout(() => electronProcess?.kill(), 60_000)

    const initialControl = await waitForControl(
      controlFile,
      (control) =>
        control.state?.phase === "ready" &&
        Number.isInteger(control.state.pid) &&
        control.bootstrap !== null,
      "initial Electron-supervised server",
    )
    const initialPid = initialControl.state.pid
    const initial = await startInitialJourney(initialControl.bootstrap, workspaceRoot)
    const initialRequests = await parseRequestLog(requestLog)
    assert.equal(
      sessionRequests(initialRequests).filter((request) => request.method === "session/new").length,
      1,
    )
    assert.equal(
      sessionRequests(initialRequests).filter((request) => request.method === "session/prompt")
        .length,
      1,
    )

    process.kill(initialPid, "SIGKILL")
    const restartedControl = await waitForControl(
      controlFile,
      (control) =>
        control.state?.phase === "ready" &&
        Number.isInteger(control.state.pid) &&
        control.state.pid !== initialPid &&
        control.bootstrap !== null,
      "the restarted Electron-supervised server child",
    )
    const recovered = await readRecoveredJourney(restartedControl.bootstrap)

    assert.deepEqual(boardContent(recovered.board), boardContent(initial.board))
    assert.equal(recovered.thread.thread.id, initial.thread.thread.id)
    assert.equal(recovered.thread.thread.title, initial.thread.thread.title)
    assert.deepEqual(recovered.thread.transcript, initial.thread.transcript)
    assert.deepEqual(recovered.thread.session?.resumeCursor, initial.thread.session?.resumeCursor)
    assert.match(recovered.thread.session?.lastError ?? "", /server restart/i)
    assert.equal(sentinelProcess.exitCode, null, "server restart must not sweep cursor-agent")

    const requestsAfterRecovery = await parseRequestLog(requestLog)
    assert.equal(
      sessionRequests(requestsAfterRecovery).filter(
        (request) => request.method === "session/prompt",
      ).length,
      1,
      "boot must not replay the first prompt",
    )
    assert.equal(
      sessionRequests(requestsAfterRecovery).filter((request) => request.method === "session/load")
        .length,
      0,
      "boot recovery must not call session/load",
    )

    const resumed = await resumeJourney(restartedControl.bootstrap)
    assert.deepEqual(resumed.session?.resumeCursor, recovered.thread.session?.resumeCursor)
    assert.doesNotMatch(transcriptTexts(resumed).join("\n"), /replayed text|load-gated text/)

    const finalRequests = await parseRequestLog(requestLog)
    const finalSessionRequests = sessionRequests(finalRequests)
    const prompts = finalSessionRequests.filter((request) => request.method === "session/prompt")
    const loads = finalSessionRequests.filter((request) => request.method === "session/load")
    const news = finalSessionRequests.filter((request) => request.method === "session/new")
    assert.equal(prompts.length, 2, "each human Turn sends exactly one prompt")
    assert.deepEqual(
      prompts.map((request) => request.params.prompt[0].text),
      [durableJourney.firstPrompt, durableJourney.secondPrompt],
    )
    assert.equal(loads.length, 1)
    assert.equal(loads[0].params.sessionId, "durable-smoke-session")
    assert.equal(news.length, 1, "resume must not fall back to session/new")
    assert.ok(finalSessionRequests.indexOf(loads[0]) < finalSessionRequests.indexOf(prompts[1]))
    assert.equal(sentinelProcess.exitCode, null, "foreign cursor-agent must remain alive")

    await writeFile(completeFile, "complete\n", "utf8")
    const exit = await electronExit
    clearTimeout(timeout)
    const shutdownDuration =
      shutdownEndpointRequestedAt === undefined
        ? undefined
        : Math.round(performance.now() - shutdownEndpointRequestedAt)
    assert.equal(exit.code, 0, `Electron exited via ${String(exit.signal)}\n${output}`)
    assert.match(output, /NOYAU_DESKTOP_SMOKE_TEST_OK/)
    assert.ok(shutdownDuration !== undefined && shutdownDuration < 2_000)

    process.stdout.write(
      [
        "Noyau Desktop durable smoke passed:",
        `  server child ${initialPid} restarted as ${restartedControl.state.pid}`,
        "  Board and transcript persisted; running Session recovered to error",
        "  resumeCursor persisted; next Turn used session/load without replay",
        `  foreign cursor-agent survived; shutdown completed in ${shutdownDuration}ms`,
      ].join("\n") + "\n",
    )
  } finally {
    if (electronProcess?.exitCode === null) {
      electronProcess.kill()
    }
    if (sentinelProcess?.exitCode === null) {
      sentinelProcess.stdin?.end()
      await delay(25)
      if (sentinelProcess.exitCode === null) {
        sentinelProcess.kill()
      }
    }
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
}

await run().catch((cause) => {
  process.stderr.write(`Noyau Desktop smoke test failed.\n${String(cause?.stack ?? cause)}\n`)
  process.exitCode = 1
})
