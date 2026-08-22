export type ComposerInlineToken =
  | {
      readonly type: "mention"
      readonly value: string
      readonly source: string
      readonly start: number
      readonly end: number
    }
  | {
      readonly type: "skill"
      readonly value: string
      readonly source: string
      readonly start: number
      readonly end: number
    }

export type ComposerPromptSegment =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "mention"; readonly path: string; readonly source: string }

const SKILL_TOKEN_REGEX = /(^|\s)\$([a-zA-Z][a-zA-Z0-9:_-]*)(?=\s|$)/g
const MENTION_TOKEN_REGEX = /(^|\s)@(?:"((?:\\.|[^"\\])*)"|([^\s@"]+))(?=\s|$)/g
const MAX_FILE_LINK_LABEL_LENGTH = 512
const FILE_LINK_TOKEN_REGEX = new RegExp(
  `(^|\\s)\\[((?:\\\\.|[^\\]\\\\]){0,${MAX_FILE_LINK_LABEL_LENGTH}})\\]\\(([^)\\s]+)\\)(?=\\s|$)`,
  "g",
)
const URI_SCHEME_REGEX = /^[A-Za-z][A-Za-z0-9+.-]*:/
const WINDOWS_DRIVE_PATH_REGEX = /^[A-Za-z]:[\\/]/

const basenameOfPath = (path: string): string => {
  const separatorIndex = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"))
  return separatorIndex >= 0 ? path.slice(separatorIndex + 1) : path
}

const overlaps = (left: ComposerInlineToken, right: ComposerInlineToken): boolean =>
  left.start < right.end && right.start < left.end

const collectMentionTokens = (text: string): ComposerInlineToken[] => {
  const matches: ComposerInlineToken[] = []

  for (const match of text.matchAll(FILE_LINK_TOKEN_REGEX)) {
    const fullMatch = match[0]
    const prefix = match[1] ?? ""
    const label = (match[2] ?? "").replace(/\\(.)/g, "$1")
    const encodedPath = match[3] ?? ""
    let path = encodedPath
    try {
      path = decodeURIComponent(encodedPath)
    } catch {
      path = encodedPath
    }
    const hasExternalScheme = URI_SCHEME_REGEX.test(path) && !WINDOWS_DRIVE_PATH_REGEX.test(path)
    if (!path || hasExternalScheme || label !== basenameOfPath(path)) {
      continue
    }
    const start = (match.index ?? 0) + prefix.length
    const end = start + fullMatch.length - prefix.length
    matches.push({
      type: "mention",
      value: path,
      source: text.slice(start, end),
      start,
      end,
    })
  }

  for (const match of text.matchAll(MENTION_TOKEN_REGEX)) {
    const fullMatch = match[0]
    const prefix = match[1] ?? ""
    const quotedPath = match[2]
    const path = quotedPath !== undefined ? quotedPath.replace(/\\(.)/g, "$1") : (match[3] ?? "")
    if (!path) {
      continue
    }
    const start = (match.index ?? 0) + prefix.length
    const end = start + fullMatch.length - prefix.length
    const token: ComposerInlineToken = {
      type: "mention",
      value: path,
      source: text.slice(start, end),
      start,
      end,
    }
    if (matches.some((existing) => overlaps(existing, token))) {
      continue
    }
    matches.push(token)
  }

  return matches
}

export function collectComposerInlineTokens(text: string): ReadonlyArray<ComposerInlineToken> {
  const matches = collectMentionTokens(text)

  for (const match of text.matchAll(SKILL_TOKEN_REGEX)) {
    const fullMatch = match[0]
    const prefix = match[1] ?? ""
    const value = match[2] ?? ""
    if (!value) {
      continue
    }
    const start = (match.index ?? 0) + prefix.length
    const end = start + fullMatch.length - prefix.length
    matches.push({
      type: "skill",
      value,
      source: text.slice(start, end),
      start,
      end,
    })
  }

  return matches.toSorted((left, right) => left.start - right.start)
}

export function composerPromptSegments(text: string): ReadonlyArray<ComposerPromptSegment> {
  const mentions = collectComposerInlineTokens(text).filter((token) => token.type === "mention")
  if (mentions.length === 0) {
    return text.length === 0 ? [] : [{ type: "text", text }]
  }

  const segments: ComposerPromptSegment[] = []
  let cursor = 0
  for (const mention of mentions) {
    if (mention.start < cursor) {
      continue
    }
    if (mention.start > cursor) {
      segments.push({ type: "text", text: text.slice(cursor, mention.start) })
    }
    segments.push({ type: "mention", path: mention.value, source: mention.source })
    cursor = mention.end
  }
  if (cursor < text.length) {
    segments.push({ type: "text", text: text.slice(cursor) })
  }
  return segments
}
