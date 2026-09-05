// Probe sync + spawn détaché : l'éditeur hôte ne doit pas rester lié au Scope Effect.
// oxlint-disable-next-line effecttsgo/node-builtin-import
import * as NodeChildProcess from "node:child_process"

import { OpenInEditorFailed, type EditorId } from "@noyau/contracts/editor"
import { Effect, Layer } from "effect"

import { EditorOpen, makeEditorOpen, type EditorProbe } from "./editor-open.ts"

const PROBE_TIMEOUT_MS = 2_000

const commandExists = (command: string): boolean => {
  try {
    NodeChildProcess.execFileSync(process.platform === "win32" ? "where" : "which", [command], {
      encoding: "utf8",
      timeout: PROBE_TIMEOUT_MS,
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    })
    return true
  } catch {
    return false
  }
}

const launch = (
  command: string,
  args: ReadonlyArray<string>,
  cwd: string,
): Effect.Effect<void, OpenInEditorFailed> =>
  Effect.try({
    try: () => {
      const child = NodeChildProcess.spawn(command, [...args], {
        cwd,
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      })
      child.unref()
    },
    catch: (cause) =>
      new OpenInEditorFailed({
        editor: inferEditorId(command),
        detail: cause instanceof Error ? cause.message : `Unable to launch ${command}`,
      }),
  })

const inferEditorId = (command: string): EditorId => {
  if (command === "code") {
    return "vscode"
  }
  if (command === "zed" || command === "zeditor") {
    return "zed"
  }
  if (command === "open" || command === "explorer" || command === "xdg-open") {
    return "file-manager"
  }
  return "cursor"
}

export const nodeEditorProbe: EditorProbe = { commandExists, launch }

export const editorOpenLayer = Layer.effect(
  EditorOpen,
  makeEditorOpen(nodeEditorProbe, process.platform),
)
