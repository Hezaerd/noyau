import { useHotkeyRecorder } from "@tanstack/react-hotkeys"
import { Undo2Icon } from "lucide-react"
import { useEffect, useState, type ReactElement } from "react"

import { SettingsPage, SettingsRow, SettingsSection } from "@/components/settings/settings-layout"
import { Button } from "@/components/ui/button"
import { KeyboardShortcut } from "@/components/ui/keyboard-shortcut"
import { useKeybindings } from "@/hooks/use-keybindings"
import { keybindingConflicts } from "@/lib/keybindings"
import {
  KEYBINDING_GROUP_IDS,
  KEYBINDING_GROUP_LABELS,
  getKeybindingDefinition,
  keybindingsInGroup,
  type KeybindingId,
} from "@/lib/keybindings-catalog"
import { isCustomKeybinding, setKeybindingRecorderActive } from "@/state/keybindings"

export function KeybindingsSettingsPanel(): ReactElement {
  const { resolved, setKeybinding, resetKeybinding } = useKeybindings()
  const [recordingId, setRecordingId] = useState<KeybindingId>()

  const recorder = useHotkeyRecorder({
    ignoreInputs: false,
    onRecord: (hotkey) => {
      if (recordingId !== undefined) {
        setKeybinding(recordingId, hotkey)
      }
      setRecordingId(undefined)
    },
    onCancel: () => {
      setRecordingId(undefined)
    },
    onClear: () => {
      if (recordingId !== undefined) {
        resetKeybinding(recordingId)
      }
      setRecordingId(undefined)
    },
  })

  useEffect(() => {
    setKeybindingRecorderActive(recordingId !== undefined)
    return () => {
      setKeybindingRecorderActive(false)
    }
  }, [recordingId])

  const startRecording = (id: KeybindingId): void => {
    if (recordingId === id) {
      recorder.cancelRecording()
      setRecordingId(undefined)
      return
    }
    if (recordingId !== undefined) {
      recorder.stopRecording()
    }
    setRecordingId(id)
    recorder.startRecording()
  }

  return (
    <SettingsPage>
      {KEYBINDING_GROUP_IDS.map((group) => {
        const keybindings = keybindingsInGroup(group)
        return (
          <SettingsSection key={group} id={group} title={KEYBINDING_GROUP_LABELS[group]}>
            {keybindings.map((keybinding) => {
              const hotkey = resolved[keybinding.id]
              const isRecording = recordingId === keybinding.id
              const customized = isCustomKeybinding(keybinding.id)
              const conflicts = keybindingConflicts(keybinding.id, hotkey, resolved)
              const conflictLabels = conflicts.map((id) => getKeybindingDefinition(id).title)

              return (
                <SettingsRow
                  key={keybinding.id}
                  id={keybinding.id}
                  title={keybinding.title}
                  description={
                    <>
                      {keybinding.description}
                      {conflictLabels.length === 0 ? null : (
                        <span className="mt-1 block text-destructive">
                          Même Raccourci que {conflictLabels.join(", ")}.
                        </span>
                      )}
                    </>
                  }
                  control={
                    <div className="flex items-center gap-1.5">
                      {customized ? (
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          aria-label={`Rétablir ${keybinding.title}`}
                          onClick={() => {
                            resetKeybinding(keybinding.id)
                          }}
                        >
                          <Undo2Icon />
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant={isRecording ? "default" : "outline"}
                        aria-label={
                          isRecording
                            ? `Enregistrement du Raccourci pour ${keybinding.title}`
                            : `Modifier le Raccourci de ${keybinding.title}`
                        }
                        onClick={() => {
                          startRecording(keybinding.id)
                        }}
                      >
                        {isRecording ? (
                          recorder.recordedHotkey === null ? (
                            "Appuie sur un Raccourci…"
                          ) : (
                            <KeyboardShortcut hotkey={recorder.recordedHotkey} />
                          )
                        ) : (
                          <KeyboardShortcut hotkey={hotkey} />
                        )}
                      </Button>
                    </div>
                  }
                />
              )
            })}
          </SettingsSection>
        )
      })}
    </SettingsPage>
  )
}
