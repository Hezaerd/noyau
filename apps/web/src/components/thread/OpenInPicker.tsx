import type { EditorId } from "@noyau/contracts/editor"
import type { ProjectId, ThreadId } from "@noyau/contracts/ids"
import { ChevronDownIcon, CodeIcon, FolderClosedIcon, SquareIcon } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"

import { CursorIcon } from "@/components/provider-icons"
import { Button } from "@/components/ui/button"
import { Group, GroupSeparator } from "@/components/ui/group"
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@/components/ui/menu"
import { listEditors, openInEditor } from "@/lib/control-plane"
import {
  editorLabel,
  persistPreferredEditor,
  readStoredPreferredEditor,
  resolvePreferredEditor,
} from "@/lib/editor-preferences"
import { presentFailure } from "@/lib/failure-presentation"
import { showFailureToast } from "@/lib/failure-toast"

const EditorGlyph = ({ editor }: { readonly editor: EditorId }) => {
  if (editor === "cursor") {
    return <CursorIcon className="size-3.5" />
  }
  if (editor === "vscode") {
    return <CodeIcon />
  }
  if (editor === "file-manager") {
    return <FolderClosedIcon className="text-muted-foreground" />
  }
  return <SquareIcon />
}

const reportOpenInFailure = (failure: Parameters<typeof presentFailure>[0]) => {
  showFailureToast(
    presentFailure(failure, {
      operation: "thread.open-in",
      scope: "project",
      initiatedByUser: true,
      hasUsableData: true,
    }),
  )
}

export function OpenInPicker({
  projectId,
  threadId,
  disabled,
}: {
  readonly projectId: ProjectId
  readonly threadId: ThreadId | undefined
  readonly disabled: boolean
}) {
  const [editors, setEditors] = useState<ReadonlyArray<EditorId>>([])
  const [preferred, setPreferred] = useState<EditorId | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void listEditors().then((result) => {
      if (!result.ok) {
        return undefined
      }
      const nextPreferred = resolvePreferredEditor(
        result.value.editors,
        readStoredPreferredEditor(),
      )
      setEditors(result.value.editors)
      setPreferred(nextPreferred)
      return undefined
    })
  }, [])

  const open = (editor: EditorId) => {
    setBusy(true)
    setPreferred(editor)
    persistPreferredEditor(editor)
    void openInEditor(
      threadId === undefined ? { projectId, editor } : { projectId, threadId, editor },
    ).then((result) => {
      setBusy(false)
      if (!result.ok) {
        reportOpenInFailure(result.failure)
      }
      return undefined
    })
  }

  if (editors.length === 0 || preferred === null) {
    return null
  }

  const primaryTrigger: ReactNode = (
    <Button
      type="button"
      size="xs"
      variant="outline"
      className="no-drag ps-[8.5px]"
      disabled={disabled || busy}
      onClick={() => open(preferred)}
    >
      <EditorGlyph editor={preferred} />
      <span className="hidden @3xl/header-actions:inline">Open</span>
    </Button>
  )

  return (
    <Group aria-label="Open in editor" className="shrink-0">
      {primaryTrigger}
      <GroupSeparator className="hidden @3xl/header-actions:block" />
      <Menu>
        <MenuTrigger
          render={
            <Button
              type="button"
              size="icon-xs"
              variant="outline"
              className="no-drag"
              aria-label="Choose editor"
              disabled={disabled || busy}
            />
          }
        >
          <ChevronDownIcon />
        </MenuTrigger>
        <MenuPopup align="end">
          {editors.map((editor) => (
            <MenuItem key={editor} onClick={() => open(editor)}>
              <EditorGlyph editor={editor} />
              {editorLabel(editor)}
            </MenuItem>
          ))}
        </MenuPopup>
      </Menu>
    </Group>
  )
}
