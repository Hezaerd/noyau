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
    throw new Error("Clipboard write failed")
  }
}

export const writeClipboardText = async (value: string): Promise<void> => {
  const clipboard = globalThis.navigator.clipboard
  if (clipboard?.writeText !== undefined) {
    try {
      await clipboard.writeText(value)
      return
    } catch {
      // Electron denies the async API when clipboard-sanitized-write is blocked.
    }
  }

  writeClipboardTextWithExecCommand(value)
}
