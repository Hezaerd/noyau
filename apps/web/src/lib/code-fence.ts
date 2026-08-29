const citationFencePattern = /^(\d+):(\d+):(.+)$/
const fenceTitleAttrPattern = /(?:^|\s)(?:title|file(?:name)?)=(?:"([^"]+)"|'([^']+)'|(\S+))/i
const fenceFilenameTokenPattern = /^[\w@][\w@./-]*\.[A-Za-z0-9]+$/

export interface ParsedCodeFence {
  readonly language: string
  readonly startLine: number | undefined
  readonly label: string
  readonly path: string | undefined
}

export const parseCodeFence = (raw: string): ParsedCodeFence => {
  const trimmed = raw.trim()
  const citation = citationFencePattern.exec(trimmed)
  if (citation === null) {
    return { language: trimmed, startLine: undefined, label: trimmed, path: undefined }
  }

  const startLine = Number.parseInt(citation[1] ?? "", 10)
  const path = citation[3] ?? trimmed
  const basename = path.split("/").pop() ?? path
  const dot = basename.lastIndexOf(".")
  const extension = dot === -1 ? "" : basename.slice(dot + 1)

  return {
    language: extension,
    startLine: Number.isFinite(startLine) && startLine >= 1 ? startLine : undefined,
    label: path,
    path,
  }
}

export const resolveCodeBlockTitle = (fence: ParsedCodeFence): string => {
  const label = fence.label.trim()
  if (label.length > 0) {
    return label
  }
  return "text"
}

/** Pulls a filename out of fence meta: ```ts title="x.ts" / ```ts src/main.ts */
export const extractFenceTitle = (meta: string | undefined): string | null => {
  if (meta === undefined) {
    return null
  }
  const attrMatch = fenceTitleAttrPattern.exec(meta)
  const attrTitle = attrMatch?.[1] ?? attrMatch?.[2] ?? attrMatch?.[3]
  if (attrTitle !== undefined && attrTitle.length > 0) {
    return attrTitle
  }
  return meta.split(/\s+/).find((candidate) => fenceFilenameTokenPattern.test(candidate)) ?? null
}

export const resolveCodeBlockFenceTitle = (
  fence: ParsedCodeFence,
  meta: string | undefined,
): string | null => extractFenceTitle(meta) ?? fence.path ?? null

export const resolveCodeBlockLanguage = (fence: ParsedCodeFence): string => {
  const language = fence.language.trim()
  return language.length > 0 ? language : "text"
}

export const isMermaidFenceLanguage = (language: string): boolean =>
  language.trim().toLowerCase() === "mermaid"
