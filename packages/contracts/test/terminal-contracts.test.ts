import { describe, expect, it } from "@effect/vitest"
import { RPC_METHODS } from "@noyau/contracts/rpc"
import {
  TerminalAttachInput,
  TerminalCloseInput,
  TerminalSessionSnapshot,
  TerminalWriteInput,
} from "@noyau/contracts/terminal"
import { Schema } from "effect"

const ids = {
  project: "10000000-0000-4000-8000-000000000001",
  thread: "20000000-0000-4000-8000-000000000001",
} as const

describe("terminal contracts", () => {
  it("expose des méthodes RPC hors orchestration", () => {
    expect(RPC_METHODS.terminalAttach).toBe("terminal.attach")
    expect(RPC_METHODS.terminalWrite).toBe("terminal.write")
    expect(RPC_METHODS.terminalResize).toBe("terminal.resize")
    expect(RPC_METHODS.terminalClear).toBe("terminal.clear")
    expect(RPC_METHODS.terminalRestart).toBe("terminal.restart")
    expect(RPC_METHODS.terminalClose).toBe("terminal.close")
  })

  it("exige un terminalId client et refuse un cwd fourni", () => {
    const decoded = Schema.decodeSync(TerminalAttachInput)({
      projectId: ids.project,
      threadId: ids.thread,
      terminalId: "term-1",
      cols: 80,
      rows: 24,
    })

    expect(decoded.terminalId).toBe("term-1")
    expect(TerminalAttachInput.fields).not.toHaveProperty("cwd")
  })

  it("borne write et refuse un id vide", () => {
    expect(() =>
      Schema.decodeSync(TerminalWriteInput)({
        projectId: ids.project,
        threadId: ids.thread,
        terminalId: "term-1",
        data: "",
      }),
    ).toThrow()
    expect(() =>
      Schema.decodeSync(TerminalAttachInput)({
        projectId: ids.project,
        threadId: ids.thread,
        terminalId: "",
      }),
    ).toThrow()
  })

  it("permet de fermer un terminal ou tous ceux du Thread", () => {
    const one = Schema.decodeSync(TerminalCloseInput)({
      projectId: ids.project,
      threadId: ids.thread,
      terminalId: "term-1",
    })
    const all = Schema.decodeSync(TerminalCloseInput)({
      projectId: ids.project,
      threadId: ids.thread,
    })

    expect(one.terminalId).toBe("term-1")
    expect(all.terminalId).toBeUndefined()
  })

  it("encode un snapshot avec une histoire brute, pas un rendu", () => {
    const snapshot = Schema.decodeSync(TerminalSessionSnapshot)({
      projectId: ids.project,
      threadId: ids.thread,
      terminalId: "term-1",
      cwd: "/tmp/workspace",
      status: "running",
      pid: 12,
      history: "hello\r\n",
      exitCode: null,
      exitSignal: null,
      label: "Terminal",
      updatedAt: "2026-08-29T12:00:00.000Z",
    })

    expect(snapshot.history).toBe("hello\r\n")
    expect(snapshot.pid).toBe(12)
  })
})
