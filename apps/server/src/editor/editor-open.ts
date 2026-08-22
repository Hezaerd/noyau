import {
  OpenInEditorFailed,
  type EditorId,
  type ListEditorsResult,
  type OpenInEditorInput,
  type OpenInEditorResult,
} from "@noyau/protocol/editor"
import type { ServiceUnavailable } from "@noyau/protocol/errors"
import { resolveWorkspaceCwd } from "@noyau/server/workspace-cwd"
import { Context, Effect } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

export const HOST_EDITORS = [
  { id: "cursor" as const, label: "Cursor", commands: ["cursor"] },
  { id: "vscode" as const, label: "VS Code", commands: ["code"] },
  { id: "zed" as const, label: "Zed", commands: ["zed", "zeditor"] },
] as const

export type HostEditor = (typeof HOST_EDITORS)[number]

export const hostEditorOf = (id: EditorId): HostEditor => {
  const editor = HOST_EDITORS.find((candidate) => candidate.id === id)
  if (editor === undefined) {
    return HOST_EDITORS[0]
  }
  return editor
}

export const resolveEditorLaunch = (editor: HostEditor, availableCommand: string, cwd: string) => ({
  command: availableCommand,
  args: [cwd],
  editor: editor.id,
})

export interface EditorProbe {
  readonly commandExists: (command: string) => boolean
  readonly launch: (
    command: string,
    args: ReadonlyArray<string>,
    cwd: string,
  ) => Effect.Effect<void, OpenInEditorFailed>
}

export interface EditorOpenService {
  readonly list: Effect.Effect<ListEditorsResult, ServiceUnavailable>
  readonly open: (
    input: OpenInEditorInput,
  ) => Effect.Effect<OpenInEditorResult, OpenInEditorFailed | ServiceUnavailable>
}

export class EditorOpen extends Context.Service<EditorOpen, EditorOpenService>()(
  "@noyau/server/editor/EditorOpen",
) {}

const firstAvailableCommand = (
  commands: ReadonlyArray<string>,
  commandExists: (command: string) => boolean,
): string | undefined => commands.find((command) => commandExists(command))

export const makeEditorOpen = (probe: EditorProbe) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient
    const scoped = <A, E>(effect: Effect.Effect<A, E, SqlClient>) =>
      effect.pipe(Effect.provideService(SqlClient, sql))

    return EditorOpen.of({
      list: Effect.sync(() => ({
        editors: HOST_EDITORS.flatMap((editor) => {
          const command = firstAvailableCommand(editor.commands, probe.commandExists)
          return command === undefined ? [] : [editor.id]
        }),
      })),
      open: (input) =>
        scoped(
          Effect.gen(function* () {
            const { cwd } = yield* resolveWorkspaceCwd(input)
            const editor = hostEditorOf(input.editor)
            const command = firstAvailableCommand(editor.commands, probe.commandExists)
            if (command === undefined) {
              return yield* new OpenInEditorFailed({
                editor: input.editor,
                detail: `${editor.label} n’est pas installé.`,
              })
            }
            const launch = resolveEditorLaunch(editor, command, cwd)
            yield* probe.launch(launch.command, launch.args, cwd)
            return { editor: input.editor, cwd }
          }),
        ),
    })
  })
