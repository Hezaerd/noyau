import { describe, expect, it } from "vite-plus/test"

import {
  threadSidebarPopoverRows,
  threadStatusLabel,
  workspaceFolderName,
} from "../src/lib/thread-sidebar-popover"

const runningTurn = { state: "running" as const }

describe("thread sidebar popover", () => {
  it("keeps the last path segment for POSIX and Windows workspace roots", () => {
    expect(workspaceFolderName("/Users/hezaerd/code/noyau")).toBe("noyau")
    expect(workspaceFolderName("C:\\Users\\hezaerd\\code\\veto-sud\\")).toBe("veto-sud")
  })

  it("omits the workspace row when it repeats the Project name", () => {
    expect(
      threadSidebarPopoverRows({
        projectName: "noyau",
        workspaceRoot: "/Users/hezaerd/code/noyau",
        provider: "cursor",
        runtimeMode: "full-access",
        sessionStatus: null,
        latestTurn: null,
        lastError: null,
        pullRequest: null,
      }).map((row) => row.kind),
    ).toEqual(["project", "provider", "runtimeMode"])
  })

  it("adds workspace, status, and lastError only when they carry information", () => {
    const rows = threadSidebarPopoverRows({
      projectName: "noyau",
      workspaceRoot: "/Users/hezaerd/code/veto-sud",
      provider: "cursor",
      runtimeMode: "approval-required",
      sessionStatus: "error",
      latestTurn: runningTurn,
      lastError: "ACP indisponible",
      pullRequest: null,
    })

    expect(rows).toEqual([
      { kind: "project", label: "noyau" },
      { kind: "workspace", label: "veto-sud" },
      { kind: "provider", label: "Cursor" },
      { kind: "runtimeMode", label: "Approbation requise" },
      { kind: "status", label: "En cours" },
      { kind: "error", label: "ACP indisponible" },
    ])
  })

  it("labels an interrupted Turn and a session error without a Turn", () => {
    expect(threadStatusLabel(null, { ...runningTurn, state: "interrupted" })).toBe("Interrompu")
    expect(threadStatusLabel("error", null)).toBe("Erreur")
    expect(threadStatusLabel("ready", null)).toBeUndefined()
  })

  it("ajoute la branche du Checkout quand elle est connue", () => {
    expect(
      threadSidebarPopoverRows({
        projectName: "noyau",
        workspaceRoot: "/Users/hezaerd/code/noyau",
        branch: "feat/thread-sidebar",
        provider: "cursor",
        runtimeMode: "full-access",
        sessionStatus: null,
        latestTurn: null,
        lastError: null,
        pullRequest: null,
      }).map((row) => row.kind),
    ).toEqual(["project", "branch", "provider", "runtimeMode"])
  })

  it("ajoute la PR live quand elle est connue", () => {
    expect(
      threadSidebarPopoverRows({
        projectName: "noyau",
        workspaceRoot: "/Users/hezaerd/code/noyau",
        provider: "cursor",
        runtimeMode: "full-access",
        sessionStatus: null,
        latestTurn: null,
        lastError: null,
        pullRequest: {
          number: 12,
          title: "Live",
          url: "https://github.com/hezaerd/noyau/pull/12",
          baseRef: "main",
          headRef: "feat",
          state: "open",
          mergeability: "unknown",
        },
      }).map((row) => row.kind),
    ).toEqual(["project", "provider", "runtimeMode", "pullRequest"])
  })
})
