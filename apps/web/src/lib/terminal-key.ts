const encodeCtrlLetter = (letter: string): string | null => {
  if (letter.length !== 1 || letter < "a" || letter > "z") {
    return null
  }
  return String.fromCharCode(letter.charCodeAt(0) - 96)
}

/** Fallback PTY key encoding when Ghostty WASM fails to load. */
export const encodeTerminalKey = (event: KeyboardEvent): string | null => {
  if (event.isComposing) {
    return null
  }
  if (event.metaKey) {
    return null
  }
  if (event.ctrlKey) {
    const letter = event.key.length === 1 ? event.key.toLowerCase() : ""
    return encodeCtrlLetter(letter)
  }
  if (event.altKey && event.key.length === 1) {
    return `\u001b${event.key}`
  }
  switch (event.key) {
    case "Enter":
      return "\r"
    case "Backspace":
      return "\u007f"
    case "Tab":
      return "\t"
    case "Escape":
      return "\u001b"
    case "ArrowUp":
      return "\u001b[A"
    case "ArrowDown":
      return "\u001b[B"
    case "ArrowRight":
      return "\u001b[C"
    case "ArrowLeft":
      return "\u001b[D"
    case "Home":
      return "\u001b[H"
    case "End":
      return "\u001b[F"
    default:
      return event.key.length === 1 ? event.key : null
  }
}
