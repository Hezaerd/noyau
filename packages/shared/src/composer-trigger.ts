export type ComposerTriggerKind = "path" | "slash-command" | "skill"

export interface ComposerTrigger {
  readonly kind: ComposerTriggerKind
  readonly query: string
  readonly rangeStart: number
  readonly rangeEnd: number
}

const SIMPLE_MENTION_PATH_REGEX = /^[^\s@"\\]+$/

export function serializeComposerMentionPath(path: string): string {
  if (SIMPLE_MENTION_PATH_REGEX.test(path)) {
    return path
  }
  return `"${path.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`
}

const clampCursor = (text: string, cursor: number): number => {
  if (!Number.isFinite(cursor)) {
    return text.length
  }
  return Math.max(0, Math.min(text.length, Math.floor(cursor)))
}

const isWhitespace = (char: string): boolean =>
  char === " " || char === "\n" || char === "\t" || char === "\r"

export function detectComposerTrigger(text: string, cursorInput: number): ComposerTrigger | null {
  const cursor = clampCursor(text, cursorInput)
  const lineStart = text.lastIndexOf("\n", Math.max(0, cursor - 1)) + 1
  const linePrefix = text.slice(lineStart, cursor)

  if (linePrefix.startsWith("/")) {
    const commandMatch = /^\/(\S*)$/.exec(linePrefix)
    if (commandMatch) {
      return {
        kind: "slash-command",
        query: commandMatch[1] ?? "",
        rangeStart: lineStart,
        rangeEnd: cursor,
      }
    }
  }

  let tokenIdx = cursor - 1
  while (tokenIdx >= 0 && !isWhitespace(text[tokenIdx] ?? "")) {
    tokenIdx -= 1
  }
  const tokenStart = tokenIdx + 1
  const token = text.slice(tokenStart, cursor)
  if (token.startsWith("$")) {
    return {
      kind: "skill",
      query: token.slice(1),
      rangeStart: tokenStart,
      rangeEnd: cursor,
    }
  }
  if (!token.startsWith("@")) {
    return null
  }
  return {
    kind: "path",
    query: token.slice(1),
    rangeStart: tokenStart,
    rangeEnd: cursor,
  }
}

export interface ReplacedTextRange {
  readonly text: string
  readonly cursor: number
}

export function replaceTextRange(
  text: string,
  rangeStart: number,
  rangeEnd: number,
  replacement: string,
): ReplacedTextRange {
  const safeStart = Math.max(0, Math.min(text.length, rangeStart))
  const safeEnd = Math.max(safeStart, Math.min(text.length, rangeEnd))
  const nextText = `${text.slice(0, safeStart)}${replacement}${text.slice(safeEnd)}`
  return { text: nextText, cursor: safeStart + replacement.length }
}
