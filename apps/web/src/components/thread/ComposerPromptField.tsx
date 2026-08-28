import { collectComposerInlineTokens } from "@noyau/shared/composer-inline-tokens"
import { replaceTextRange } from "@noyau/shared/composer-trigger"
import {
  useEffect,
  useImperativeHandle,
  useRef,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type Ref,
} from "react"

import { paintComposerPrompt } from "@/components/thread/paint-composer-prompt"
import {
  composerPromptFieldCaretOffset,
  composerPromptFieldSelectionOffsets,
  isComposerPromptDomEmpty,
  serializeComposerPromptField,
  serializeComposerPromptSelection,
  setComposerPromptFieldCaret,
} from "@/lib/composer-prompt-field"
import { EMPTY_COMPOSER_TICKETS, type ComposerTicket } from "@/lib/composer-tickets"
import { cn } from "@/lib/utils"

export const COMPOSER_PROMPT_FIELD_CLASS_NAME =
  "min-h-24 max-h-52 w-full overflow-y-auto whitespace-pre-wrap break-words px-[calc(--spacing(3)-1px)] py-[calc(--spacing(1.5)-1px)] text-base leading-6 outline-none sm:text-sm"

export type ComposerPromptFieldHandle = {
  readonly focus: () => void
  readonly setCursor: (offset: number) => void
}

export function ComposerPromptField({
  ref,
  text,
  disabled,
  autoFocus,
  pathMenuOpen,
  tickets = EMPTY_COMPOSER_TICKETS,
  listboxId,
  activeOptionId,
  onTextChange,
  onCursorChange,
  onKeyDown,
  onPaste,
  onDrop,
}: {
  readonly ref?: Ref<ComposerPromptFieldHandle>
  readonly text: string
  readonly disabled: boolean
  readonly autoFocus: boolean
  readonly pathMenuOpen: boolean
  readonly tickets?: ReadonlyArray<ComposerTicket> | undefined
  readonly listboxId: string
  readonly activeOptionId: string | undefined
  readonly onTextChange: (value: string) => void
  readonly onCursorChange: (cursor: number) => void
  readonly onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
  readonly onPaste: (event: ClipboardEvent<HTMLElement>) => void
  readonly onDrop: (event: DragEvent<HTMLElement>) => void
}) {
  const editorRef = useRef<HTMLDivElement>(null)
  const syncedText = useRef(text)
  const pendingCaret = useRef<number | null>(null)
  const painted = useRef(false)
  const composing = useRef(false)
  const didAutoFocus = useRef(false)
  const onCursorChangeRef = useRef(onCursorChange)
  const onTextChangeRef = useRef(onTextChange)

  useEffect(() => {
    onCursorChangeRef.current = onCursorChange
  }, [onCursorChange])
  useEffect(() => {
    onTextChangeRef.current = onTextChange
  }, [onTextChange])

  const restoreCaret = (offset: number) => {
    const editor = editorRef.current
    if (editor === null) {
      return
    }
    setComposerPromptFieldCaret(editor, offset)
    onCursorChangeRef.current(offset)
  }

  const writeSerializedClipboard = (event: ClipboardEvent<HTMLElement>): string => {
    const editor = editorRef.current
    if (editor === null || event.clipboardData === null) {
      return ""
    }
    const serialized = serializeComposerPromptSelection(editor)
    if (serialized.length === 0) {
      return ""
    }
    event.preventDefault()
    event.clipboardData.setData("text/plain", serialized)
    return serialized
  }

  const applyExternalText = (nextText: string, cursor: number) => {
    pendingCaret.current = cursor
    onTextChangeRef.current(nextText)
    onCursorChangeRef.current(cursor)
  }

  const syncFromDom = () => {
    const editor = editorRef.current
    if (editor === null || composing.current) {
      return
    }
    const next = serializeComposerPromptField(editor)
    if (next.length === 0 && !isComposerPromptDomEmpty(editor)) {
      editor.replaceChildren()
    }
    const caret = next.length === 0 ? 0 : composerPromptFieldCaretOffset(editor)
    pendingCaret.current = caret
    syncedText.current = next
    onTextChangeRef.current(next)
    onCursorChangeRef.current(caret)
  }

  useImperativeHandle(ref, () => ({
    focus: () => {
      editorRef.current?.focus()
    },
    setCursor: (offset) => {
      pendingCaret.current = offset
      restoreCaret(offset)
    },
  }))

  useEffect(() => {
    const editor = editorRef.current
    if (editor === null) {
      return
    }
    if (text === syncedText.current && painted.current) {
      const caret = pendingCaret.current
      if (caret !== null) {
        pendingCaret.current = null
        restoreCaret(caret)
      }
      return
    }
    const paint = () => {
      if (editorRef.current === null) {
        return
      }
      syncedText.current = text
      paintComposerPrompt(editorRef.current, text, tickets)
      painted.current = true
      const caret = pendingCaret.current ?? text.length
      pendingCaret.current = null
      restoreCaret(caret)
    }
    queueMicrotask(paint)
  }, [text, tickets])

  useEffect(() => {
    if (!autoFocus || disabled || didAutoFocus.current) {
      return
    }
    didAutoFocus.current = true
    editorRef.current?.focus()
  }, [autoFocus, disabled])

  return (
    <span className="relative inline-flex w-full flex-1 before:hidden">
      {text.length === 0 ? (
        <span
          aria-hidden
          className={cn(
            COMPOSER_PROMPT_FIELD_CLASS_NAME,
            "pointer-events-none absolute inset-0 text-muted-foreground/72",
          )}
        >
          Write a message…
        </span>
      ) : null}
      <div
        ref={editorRef}
        role="textbox"
        aria-multiline="true"
        aria-label="Compose a message"
        aria-disabled={disabled}
        aria-autocomplete={pathMenuOpen ? "list" : undefined}
        aria-controls={pathMenuOpen ? listboxId : undefined}
        aria-expanded={pathMenuOpen ? true : undefined}
        aria-activedescendant={activeOptionId}
        data-slot="input-group-control"
        data-composer-value={text}
        contentEditable={!disabled}
        suppressContentEditableWarning
        spellCheck={false}
        tabIndex={disabled ? -1 : 0}
        className={cn(
          COMPOSER_PROMPT_FIELD_CLASS_NAME,
          "relative caret-foreground",
          disabled && "opacity-50",
        )}
        onInput={syncFromDom}
        onCompositionStart={() => {
          composing.current = true
        }}
        onCompositionEnd={() => {
          composing.current = false
          syncFromDom()
        }}
        onKeyDown={onKeyDown}
        onKeyUp={() => {
          const editor = editorRef.current
          if (editor !== null) {
            onCursorChange(composerPromptFieldCaretOffset(editor))
          }
        }}
        onClick={() => {
          const editor = editorRef.current
          if (editor !== null) {
            onCursorChange(composerPromptFieldCaretOffset(editor))
          }
        }}
        onCopy={(event) => {
          writeSerializedClipboard(event)
        }}
        onCut={(event) => {
          if (writeSerializedClipboard(event).length === 0) {
            return
          }
          const editor = editorRef.current
          if (editor === null) {
            return
          }
          const current = serializeComposerPromptField(editor)
          const { start, end } = composerPromptFieldSelectionOffsets(editor)
          const next = replaceTextRange(current, start, end, "")
          applyExternalText(next.text, next.cursor)
        }}
        onPaste={(event) => {
          onPaste(event)
          if (event.defaultPrevented) {
            return
          }
          const pasted = event.clipboardData?.getData("text/plain") ?? ""
          const hasMention = collectComposerInlineTokens(`${pasted}\n`).some(
            (token) =>
              (token.type === "mention" || token.type === "ticket") && token.end <= pasted.length,
          )
          if (!hasMention) {
            return
          }
          event.preventDefault()
          const editor = editorRef.current
          if (editor === null) {
            return
          }
          const current = serializeComposerPromptField(editor)
          const { start, end } = composerPromptFieldSelectionOffsets(editor)
          const next = replaceTextRange(current, start, end, pasted)
          applyExternalText(next.text, next.cursor)
        }}
        onDrop={onDrop}
        onDragOver={(event) => {
          if (Array.from(event.dataTransfer.types).includes("Files")) {
            event.preventDefault()
          }
        }}
      />
    </span>
  )
}
