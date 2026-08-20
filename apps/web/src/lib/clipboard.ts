import { Effect, Option, Schema } from "effect"

class ClipboardWriteError extends Schema.TaggedError<ClipboardWriteError>()("ClipboardWriteError", {
  message: Schema.String,
  cause: Schema.optionalKey(Schema.Defect()),
}) {}

const writeClipboardTextWithExecCommand = (value: string): void => {
  const textarea = document.createElement("textarea")
  textarea.value = value
  textarea.setAttribute("readonly", "")
  textarea.style.position = "fixed"
  textarea.style.opacity = "0"
  document.body.append(textarea)
  textarea.select()
  textarea.setSelectionRange(0, value.length)

  let copied = false
  try {
    copied = document.execCommand("copy")
  } catch {
    copied = false
  } finally {
    textarea.remove()
  }

  if (!copied) {
    throw new ClipboardWriteError({ message: "Clipboard write failed" })
  }
}

export const writeClipboardTextEffect = Effect.fn("writeClipboardText")(function* (value: string) {
  const clipboard = globalThis.navigator.clipboard
  if (clipboard?.writeText !== undefined) {
    const written = yield* Effect.tryPromise({
      try: () => clipboard.writeText(value),
      catch: (cause) => new ClipboardWriteError({ message: "Clipboard write failed", cause }),
    }).pipe(Effect.option)
    if (Option.isSome(written)) {
      return
    }
  }

  yield* Effect.try({
    try: () => {
      writeClipboardTextWithExecCommand(value)
    },
    catch: (cause) =>
      Schema.is(ClipboardWriteError)(cause)
        ? cause
        : new ClipboardWriteError({ message: "Clipboard write failed", cause }),
  })
})

export const writeClipboardText = (value: string) =>
  Effect.runPromise(writeClipboardTextEffect(value))
