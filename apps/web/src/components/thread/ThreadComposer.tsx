import type { ClipboardEvent, DragEvent, FormEvent, ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

export function ThreadComposer({
  isRunning,
  disabled,
  text,
  error,
  onSubmit,
  onTextChange,
  onPaste,
  onDrop,
  onInterrupt,
}: {
  readonly isRunning: boolean
  readonly disabled: boolean
  readonly text: string
  readonly error: ReactNode
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void
  readonly onTextChange: (value: string) => void
  readonly onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void
  readonly onDrop: (event: DragEvent<HTMLTextAreaElement>) => void
  readonly onInterrupt: () => void
}) {
  const sendDisabled = text.trim() === "" || isRunning || disabled

  return (
    <form
      onSubmit={onSubmit}
      className="sticky bottom-0 z-20 shrink-0 border-t bg-background/95 p-4 backdrop-blur-xl sm:px-6"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-2">
        <Textarea
          value={text}
          onChange={(event) => {
            onTextChange(event.target.value)
          }}
          onPaste={onPaste}
          onDrop={onDrop}
          onDragOver={(event) => {
            if (Array.from(event.dataTransfer.types).includes("Files")) {
              event.preventDefault()
            }
          }}
          placeholder="Écrire un message…"
          aria-label="Composer un message"
          aria-describedby={error === undefined ? undefined : "thread-composer-error"}
          aria-invalid={error === undefined ? undefined : true}
          disabled={isRunning || disabled}
          rows={3}
        />
        <div className="flex flex-wrap items-center justify-end gap-2">
          {error === undefined ? null : (
            <div className="mr-auto" id="thread-composer-error">
              {error}
            </div>
          )}
          <div className="flex gap-2">
            {isRunning ? (
              <Button type="button" variant="outline" onClick={onInterrupt}>
                Interrompre
              </Button>
            ) : null}
            <Button type="submit" disabled={sendDisabled}>
              Envoyer
            </Button>
          </div>
        </div>
      </div>
    </form>
  )
}
