/** Fallback PTY key encoding when Ghostty WASM fails to load. */
export const encodeTerminalKey = (event: KeyboardEvent): string | null => {
  if (event.isComposing) {
    return null
  }
  if (event.ctrlKey || event.metaKey) {
    const letter = event.key.length === 1 ? event.key.toLowerCase() : ""
    if (letter === "c") {
      return "\u0003"
    }
    if (letter === "d") {
      return "\u0004"
    }
    if (letter === "l") {
      return "\u000c"
    }
    if (letter === "u") {
      return "\u0015"
    }
    return null
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
