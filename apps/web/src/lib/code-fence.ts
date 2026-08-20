const citationFencePattern = /^(\d+):(\d+):(.+)$/

export interface ParsedCodeFence {
  readonly language: string
  readonly startLine: number | undefined
  readonly label: string
}

export const parseCodeFence = (raw: string): ParsedCodeFence => {
  const trimmed = raw.trim()
  const citation = citationFencePattern.exec(trimmed)
  if (citation === null) {
    return { language: trimmed, startLine: undefined, label: trimmed }
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
  }
}
