import { Schema } from "effect"

const FALLBACK_NAME = "Cursor tool"
const MAX_SUMMARY_LENGTH = 160
const GENERIC_TITLES = new Set(["terminal", "tool call", "cursor tool"])

const CommandParts = Schema.Union([Schema.String, Schema.Array(Schema.String)])

const NestedToolInput = Schema.Struct({
  command: Schema.optionalKey(CommandParts),
  path: Schema.optionalKey(Schema.String),
  filePath: Schema.optionalKey(Schema.String),
  query: Schema.optionalKey(Schema.String),
  pattern: Schema.optionalKey(Schema.String),
})

const ToolCallRawInput = Schema.Struct({
  command: Schema.optionalKey(CommandParts),
  executable: Schema.optionalKey(Schema.String),
  args: Schema.optionalKey(CommandParts),
  path: Schema.optionalKey(Schema.String),
  filePath: Schema.optionalKey(Schema.String),
  relativePath: Schema.optionalKey(Schema.String),
  filename: Schema.optionalKey(Schema.String),
  newPath: Schema.optionalKey(Schema.String),
  oldPath: Schema.optionalKey(Schema.String),
  query: Schema.optionalKey(Schema.String),
  pattern: Schema.optionalKey(Schema.String),
  searchTerm: Schema.optionalKey(Schema.String),
  url: Schema.optionalKey(Schema.String),
  uri: Schema.optionalKey(Schema.String),
  input: Schema.optionalKey(NestedToolInput),
})

const decodeRawInput = Schema.decodeUnknownOption(ToolCallRawInput)

export interface ToolCallPresentationInput {
  readonly title?: string | null
  readonly kind?: string | null
  readonly locations?: ReadonlyArray<{ readonly path: string }> | null
  readonly rawInput?: typeof ToolCallRawInput.Encoded | Schema.Json
}

export interface ToolCallPresentation {
  readonly name: string
  readonly outputSummary?: string
}

const asTrimmedString = (value: string | undefined): string | undefined => {
  if (value === undefined) {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

const isCommandPartsArray = (
  value: string | ReadonlyArray<string>,
): value is ReadonlyArray<string> => Array.isArray(value)

const joinCommandParts = (
  value: string | ReadonlyArray<string> | undefined,
): string | undefined => {
  if (value === undefined) {
    return undefined
  }
  if (isCommandPartsArray(value)) {
    const parts: Array<string> = []
    for (const entry of value) {
      const part = asTrimmedString(entry)
      if (part !== undefined) {
        parts.push(part)
      }
    }
    return parts.length > 0 ? parts.join(" ") : undefined
  }
  return asTrimmedString(value)
}

const extractCommandFromTitle = (title: string | undefined): string | undefined => {
  if (title === undefined) {
    return undefined
  }
  const match = /`([^`]+)`/u.exec(title)
  return match?.[1]?.trim() || undefined
}

const extractCommand = (
  rawInput: typeof ToolCallRawInput.Type | undefined,
  title: string | undefined,
): string | undefined => {
  const candidates = [
    joinCommandParts(rawInput?.command),
    joinCommandParts(rawInput?.input?.command),
  ]
  const direct = candidates.find((candidate) => candidate !== undefined)
  if (direct !== undefined) {
    return direct
  }
  const executable = asTrimmedString(rawInput?.executable)
  const args = joinCommandParts(rawInput?.args)
  if (executable !== undefined && args !== undefined) {
    return `${executable} ${args}`
  }
  if (executable !== undefined) {
    return executable
  }
  return extractCommandFromTitle(title)
}

const maybePathLike = (value: string | undefined): string | undefined => {
  if (value === undefined) {
    return undefined
  }
  if (
    value.includes("/") ||
    value.includes("\\") ||
    value.startsWith(".") ||
    /\.(?:[a-z0-9]{1,12})$/iu.test(value)
  ) {
    return value
  }
  return undefined
}

const extractPrimaryPath = (
  locations: ToolCallPresentationInput["locations"],
  rawInput: typeof ToolCallRawInput.Type | undefined,
): string | undefined => {
  const locationPath = maybePathLike(asTrimmedString(locations?.[0]?.path))
  if (locationPath !== undefined) {
    return locationPath
  }
  for (const candidate of [
    rawInput?.path,
    rawInput?.filePath,
    rawInput?.relativePath,
    rawInput?.filename,
    rawInput?.newPath,
    rawInput?.oldPath,
    rawInput?.input?.path,
    rawInput?.input?.filePath,
  ]) {
    const path = maybePathLike(asTrimmedString(candidate))
    if (path !== undefined) {
      return path
    }
  }
  return undefined
}

const extractQuery = (rawInput: typeof ToolCallRawInput.Type | undefined): string | undefined =>
  asTrimmedString(rawInput?.query) ??
  asTrimmedString(rawInput?.pattern) ??
  asTrimmedString(rawInput?.searchTerm) ??
  asTrimmedString(rawInput?.url) ??
  asTrimmedString(rawInput?.uri) ??
  asTrimmedString(rawInput?.input?.query) ??
  asTrimmedString(rawInput?.input?.pattern)

const classifyAction = (
  kind: string | undefined,
  title: string | undefined,
): "command" | "read" | "file_change" | "search" | "fetch" | "think" | "other" => {
  const normalizedKind = kind?.toLowerCase()
  const normalizedTitle = title?.toLowerCase()
  if (normalizedKind === "execute" || normalizedTitle === "terminal") {
    return "command"
  }
  if (normalizedKind === "read" || normalizedTitle === "read file") {
    return "read"
  }
  if (
    normalizedKind === "edit" ||
    normalizedKind === "move" ||
    normalizedKind === "delete" ||
    normalizedKind === "write"
  ) {
    return "file_change"
  }
  if (normalizedKind === "search" || normalizedTitle === "find" || normalizedTitle === "grep") {
    return "search"
  }
  if (normalizedKind === "fetch") {
    return "fetch"
  }
  if (normalizedKind === "think") {
    return "think"
  }
  return "other"
}

const collapseWhitespace = (value: string): string => value.replace(/\s+/gu, " ").trim()

const truncateSummary = (value: string): string => {
  const collapsed = collapseWhitespace(value)
  if (collapsed.length <= MAX_SUMMARY_LENGTH) {
    return collapsed
  }
  return `${collapsed.slice(0, MAX_SUMMARY_LENGTH - 1)}…`
}

const normalizeEquivalent = (value: string | undefined): string | undefined => {
  const trimmed = asTrimmedString(value)
  if (trimmed === undefined) {
    return undefined
  }
  return collapseWhitespace(trimmed)
    .replace(/\s+(?:complete|completed|started)\s*$/iu, "")
    .toLowerCase()
}

const isEquivalent = (left: string | undefined, right: string | undefined): boolean => {
  const normalizedLeft = normalizeEquivalent(left)
  const normalizedRight = normalizeEquivalent(right)
  return normalizedLeft !== undefined && normalizedLeft === normalizedRight
}

const withOptionalSummary = (name: string, detail: string | undefined): ToolCallPresentation => {
  if (detail === undefined || isEquivalent(detail, name)) {
    return { name }
  }
  return { name, outputSummary: truncateSummary(detail) }
}

const usableTitle = (title: string | undefined): string | undefined => {
  if (title === undefined) {
    return undefined
  }
  return GENERIC_TITLES.has(title.toLowerCase()) ? undefined : title
}

/**
 * Maps an ACP tool_call to the compact TranscriptTool caption. Never uses
 * rawOutput — that payload is often a whole file serialized as JSON.
 */
export const deriveToolCallPresentation = (
  input: ToolCallPresentationInput,
): ToolCallPresentation => {
  const title = asTrimmedString(input.title ?? undefined)
  const kind = asTrimmedString(input.kind ?? undefined)
  const decodedRawInput = decodeRawInput(input.rawInput)
  const rawInput = decodedRawInput._tag === "Some" ? decodedRawInput.value : undefined
  const command = extractCommand(rawInput, title)
  const primaryPath = extractPrimaryPath(input.locations, rawInput)
  const query = extractQuery(rawInput)
  const action = classifyAction(kind, title)
  const nameFallback = usableTitle(title) ?? kind ?? FALLBACK_NAME

  switch (action) {
    case "command":
      return withOptionalSummary("Ran command", command)
    case "read":
      return withOptionalSummary("Read file", primaryPath)
    case "file_change":
      return withOptionalSummary("Changed files", primaryPath)
    case "search":
      return withOptionalSummary("Searched files", query ?? primaryPath)
    case "fetch":
      return withOptionalSummary("Fetched", query ?? primaryPath)
    case "think":
      return { name: usableTitle(title) ?? "Thinking" }
    case "other":
      return withOptionalSummary(nameFallback, command ?? primaryPath ?? query)
  }
}
