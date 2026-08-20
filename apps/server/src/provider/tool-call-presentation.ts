import type { TranscriptToolAction } from "@noyau/protocol/entities/transcript"
import { Schema } from "effect"

const FALLBACK_NAME = "Cursor tool"
const MAX_SUMMARY_LENGTH = 160
const GENERIC_TITLES = new Set(["terminal", "tool call", "cursor tool"])
const WRITE_TITLES = new Set(["write", "write file", "wrote file"])

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
const decodeRawContent = Schema.decodeUnknownOption(
  Schema.Struct({
    content: Schema.optionalKey(Schema.String),
  }),
)

export interface ToolCallPresentationInput {
  readonly title?: string | null
  readonly kind?: string | null
  readonly locations?: ReadonlyArray<{ readonly path: string }> | null
  readonly content?: ReadonlyArray<{
    readonly type?: string | null
    readonly path?: string | null
  }> | null
  readonly rawInput?: typeof ToolCallRawInput.Encoded | Schema.Json
}

export interface ToolCallPresentation {
  readonly action: TranscriptToolAction
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

const extractDiffPath = (content: ToolCallPresentationInput["content"]): string | undefined => {
  if (content === undefined || content === null) {
    return undefined
  }
  for (const block of content) {
    if (block.type === "diff") {
      const path = maybePathLike(asTrimmedString(block.path ?? undefined))
      if (path !== undefined) {
        return path
      }
    }
  }
  return undefined
}

const extractPrimaryPath = (
  locations: ToolCallPresentationInput["locations"],
  content: ToolCallPresentationInput["content"],
  rawInput: typeof ToolCallRawInput.Type | undefined,
): string | undefined => {
  const locationPath = maybePathLike(asTrimmedString(locations?.[0]?.path))
  if (locationPath !== undefined) {
    return locationPath
  }
  const diffPath = extractDiffPath(content)
  if (diffPath !== undefined) {
    return diffPath
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

const extractRawContentString = (
  rawInput: ToolCallPresentationInput["rawInput"],
): string | undefined => {
  const decoded = decodeRawContent(rawInput)
  return decoded._tag === "Some" ? asTrimmedString(decoded.value.content) : undefined
}

const classifyAction = (
  kind: string | undefined,
  title: string | undefined,
): TranscriptToolAction => {
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
    normalizedKind === "write" ||
    (normalizedTitle !== undefined && WRITE_TITLES.has(normalizedTitle))
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

const inferActionFromPayload = (
  command: string | undefined,
  query: string | undefined,
  rawContent: string | undefined,
): TranscriptToolAction | undefined => {
  if (command !== undefined) {
    return "command"
  }
  if (query !== undefined) {
    return query.includes("://") ? "fetch" : "search"
  }
  if (rawContent !== undefined) {
    return "file_change"
  }
  return undefined
}

const collapseWhitespace = (value: string): string => value.replace(/\s+/gu, " ").trim()

const looksLikeJsonDump = (value: string): boolean => {
  const trimmed = value.trim()
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return false
  }
  return (
    trimmed.includes('"content"') || trimmed.includes("\\n") || /"[A-Za-z_]\w*":/u.test(trimmed)
  )
}

const rejectDump = (value: string | undefined): string | undefined => {
  if (value === undefined || looksLikeJsonDump(value)) {
    return undefined
  }
  return value
}

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

const withOptionalSummary = (
  action: TranscriptToolAction,
  name: string,
  detail: string | undefined,
): ToolCallPresentation => {
  const summary = rejectDump(detail)
  if (summary === undefined || isEquivalent(summary, name)) {
    return { action, name }
  }
  return { action, name, outputSummary: truncateSummary(summary) }
}

const usableTitle = (title: string | undefined): string | undefined => {
  if (title === undefined) {
    return undefined
  }
  return GENERIC_TITLES.has(title.toLowerCase()) ? undefined : title
}

const isWriteLabel = (kind: string | undefined, title: string | undefined): boolean => {
  const normalizedKind = kind?.toLowerCase()
  const normalizedTitle = title?.toLowerCase()
  return (
    normalizedKind === "write" ||
    (normalizedTitle !== undefined && WRITE_TITLES.has(normalizedTitle))
  )
}

/**
 * Maps an ACP tool_call to the compact TranscriptTool caption. Never uses
 * rawOutput or rawInput.content — those payloads are often a whole file.
 */
export const deriveToolCallPresentation = (
  input: ToolCallPresentationInput,
): ToolCallPresentation => {
  const title = asTrimmedString(input.title ?? undefined)
  const kind = asTrimmedString(input.kind ?? undefined)
  const decodedRawInput = decodeRawInput(input.rawInput)
  const rawInput = decodedRawInput._tag === "Some" ? decodedRawInput.value : undefined
  const rawContent = extractRawContentString(input.rawInput)
  const command = extractCommand(rawInput, title)
  const primaryPath = extractPrimaryPath(input.locations, input.content, rawInput)
  const query = extractQuery(rawInput)
  const classified = classifyAction(kind, title)
  const inferred =
    classified === "other" ? inferActionFromPayload(command, query, rawContent) : undefined
  const action = inferred ?? classified
  const wrote = isWriteLabel(kind, title) || (classified === "other" && rawContent !== undefined)
  const nameFallback = usableTitle(title) ?? kind ?? FALLBACK_NAME

  switch (action) {
    case "command":
      return withOptionalSummary("command", "Ran command", command)
    case "read":
      return withOptionalSummary("read", "Read file", primaryPath)
    case "file_change":
      return withOptionalSummary("file_change", wrote ? "Wrote file" : "Changed files", primaryPath)
    case "search":
      return withOptionalSummary("search", "Searched files", query ?? primaryPath)
    case "fetch":
      return withOptionalSummary("fetch", "Fetched", query ?? primaryPath)
    case "think":
      return { action: "think", name: usableTitle(title) ?? "Thinking" }
    case "other":
      return withOptionalSummary("other", nameFallback, command ?? primaryPath ?? query)
  }
}
