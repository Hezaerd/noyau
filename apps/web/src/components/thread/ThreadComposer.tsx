import type { ClipboardEvent, DragEvent, FormEvent } from "react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

export function ThreadComposer({
  isNewThread,
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
  readonly isNewThread: boolean
  readonly isRunning: boolean
  readonly disabled: boolean
  readonly text: string
  readonly error: string | undefined
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void
  readonly onTextChange: (value: string) => void
  readonly onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void
  readonly onDrop: (event: DragEvent<HTMLTextAreaElement>) => void
  readonly onInterrupt: () => void
}) {
  const sendDisabled = text.trim() === "" || isRunning || disabled

  return (
    <form onSubmit={onSubmit} className="border-t bg-background/90 p-4 sm:px-6">
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
          placeholder={
            isNewThread ? "Premier prompt : il donnera son titre au Thread…" : "Écrire un message…"
          }
          aria-label="Composer un message"
          disabled={isRunning || disabled}
          rows={3}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Images refusées dans la coupe v0.1.
            {error === undefined ? null : ` ${error}`}
          </p>
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
