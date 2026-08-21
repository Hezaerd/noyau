import type { RuntimeMode } from "@noyau/protocol/entities/runtime-mode"
import type { ClipboardEvent, DragEvent, FormEvent, KeyboardEvent } from "react"

import { Button } from "@/components/ui/button"
import { InputGroup, InputGroupAddon, InputGroupTextarea } from "@/components/ui/input-group"
import {
  Select,
  SelectGroup,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { isRuntimeMode, runtimeModes } from "@/lib/thread-commands"

const shouldSubmitComposerOnEnter = (event: {
  readonly key: string
  readonly shiftKey: boolean
  readonly isComposing: boolean
}) => event.key === "Enter" && !event.shiftKey && !event.isComposing

export function ThreadComposer({
  isRunning,
  disabled,
  text,
  runtimeMode,
  error,
  onSubmit,
  onTextChange,
  onRuntimeModeChange,
  onPaste,
  onDrop,
  onInterrupt,
}: {
  readonly isRunning: boolean
  readonly disabled: boolean
  readonly text: string
  readonly runtimeMode: RuntimeMode
  readonly error: string | undefined
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void
  readonly onTextChange: (value: string) => void
  readonly onRuntimeModeChange: (runtimeMode: RuntimeMode) => void
  readonly onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void
  readonly onDrop: (event: DragEvent<HTMLTextAreaElement>) => void
  readonly onInterrupt: () => void
}) {
  const sendDisabled = text.trim() === "" || isRunning || disabled
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      !shouldSubmitComposerOnEnter({
        key: event.key,
        shiftKey: event.shiftKey,
        isComposing: event.nativeEvent.isComposing,
      })
    ) {
      return
    }
    event.preventDefault()
    event.currentTarget.form?.requestSubmit()
  }

  return (
    <form
      onSubmit={onSubmit}
      className="sticky bottom-0 z-20 shrink-0 border-t bg-background/95 p-4 backdrop-blur-xl sm:px-6"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-2">
        <InputGroup>
          <InputGroupTextarea
            value={text}
            onChange={(event) => {
              onTextChange(event.target.value)
            }}
            onKeyDown={handleKeyDown}
            onPaste={onPaste}
            onDrop={onDrop}
            onDragOver={(event) => {
              if (Array.from(event.dataTransfer.types).includes("Files")) {
                event.preventDefault()
              }
            }}
            className="min-h-24 max-h-60"
            placeholder="Écrire un message…"
            aria-label="Composer un message"
            disabled={isRunning || disabled}
            rows={3}
          />
          <InputGroupAddon align="block-end" className="flex-wrap gap-2">
            <Select
              items={runtimeModes}
              value={runtimeMode}
              disabled={isRunning || disabled}
              onValueChange={(value) => {
                if (value !== null && isRuntimeMode(value)) {
                  onRuntimeModeChange(value)
                }
              }}
            >
              <SelectTrigger size="sm" className="w-auto max-w-52" aria-label="Niveau d’accès">
                <SelectValue />
              </SelectTrigger>
              <SelectPopup alignItemWithTrigger={false}>
                <SelectGroup>
                  {runtimeModes.map((mode) => (
                    <SelectItem key={mode.value} value={mode.value}>
                      {mode.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectPopup>
            </Select>
            <div className="ml-auto flex gap-2">
              {isRunning ? (
                <Button type="button" size="sm" variant="outline" onClick={onInterrupt}>
                  Interrompre
                </Button>
              ) : null}
              <Button type="submit" size="sm" disabled={sendDisabled}>
                Envoyer
              </Button>
            </div>
          </InputGroupAddon>
        </InputGroup>
        {error === undefined ? null : (
          <p className="text-xs text-muted-foreground" role="alert">
            {error}
          </p>
        )}
      </div>
    </form>
  )
}
