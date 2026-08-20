import { RefreshCwIcon } from "lucide-react"
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"

export function ThreadTitleBar({
  title,
  isRegenerating,
  onRename,
  onRegenerate,
}: {
  readonly title: string
  readonly isRegenerating: boolean
  readonly onRename: (title: string) => Promise<boolean>
  readonly onRegenerate: () => Promise<boolean>
}) {
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(title)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (renaming) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [renaming])

  useEffect(() => {
    if (!renaming) {
      setDraft(title)
    }
  }, [renaming, title])

  const commitRename = async () => {
    const next = draft.trim()
    if (next === "" || next === title) {
      setRenaming(false)
      setDraft(title)
      return
    }
    if (await onRename(next)) {
      setRenaming(false)
    }
  }

  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border/70 px-4 sm:px-6">
      {renaming ? (
        <form
          className="min-w-0 flex-1"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault()
            void commitRename()
          }}
        >
          <Input
            ref={inputRef}
            nativeInput
            size="sm"
            value={draft}
            aria-label="Renommer le Thread"
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => {
              void commitRename()
            }}
            onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
              if (event.key === "Escape") {
                event.preventDefault()
                setRenaming(false)
                setDraft(title)
              }
            }}
          />
        </form>
      ) : (
        <button
          type="button"
          className="min-w-0 truncate text-left text-sm font-medium tracking-[-0.015em]"
          onClick={() => {
            setDraft(title)
            setRenaming(true)
          }}
        >
          {title}
        </button>
      )}
      {isRegenerating ? <Spinner className="size-3.5" /> : null}
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="Régénérer le titre"
        disabled={isRegenerating || renaming}
        onClick={() => {
          void onRegenerate()
        }}
      >
        <RefreshCwIcon />
      </Button>
    </div>
  )
}
