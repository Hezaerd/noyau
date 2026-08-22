import type * as AcpSchema from "@noyau/acp/schema"
import { composerPromptSegments } from "@noyau/shared/composer-inline-tokens"
import { Effect, Option, Path } from "effect"

const isInsideWorkspace = (
  path: Path.Path,
  workspaceRoot: string,
  absolutePath: string,
): boolean => {
  const relative = path.relative(path.resolve(workspaceRoot), path.resolve(absolutePath))
  return (
    relative !== "" &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== ".." &&
    !path.isAbsolute(relative)
  )
}

const resolveMentionPath = (
  path: Path.Path,
  workspaceRoot: string,
  mentionPath: string,
): string | null => {
  const trimmed = mentionPath.trim()
  if (trimmed.length === 0) {
    return null
  }
  const absolute = path.isAbsolute(trimmed)
    ? path.normalize(trimmed)
    : path.resolve(workspaceRoot, trimmed)
  return isInsideWorkspace(path, workspaceRoot, absolute) ? absolute : null
}

export const promptContentBlocks = Effect.fn("promptContentBlocks")(function* (
  text: string,
  workspaceRoot: string,
) {
  const path = yield* Path.Path
  const blocks: Array<AcpSchema.ContentBlock> = []
  let pendingText = ""

  const flushText = () => {
    if (pendingText.length > 0) {
      blocks.push({ type: "text", text: pendingText })
      pendingText = ""
    }
  }

  for (const segment of composerPromptSegments(text)) {
    if (segment.type === "text") {
      pendingText += segment.text
      continue
    }
    const absolute = resolveMentionPath(path, workspaceRoot, segment.path)
    if (absolute === null) {
      pendingText += segment.source
      continue
    }
    const fileUrl = yield* path.toFileUrl(absolute).pipe(Effect.option)
    if (Option.isNone(fileUrl)) {
      pendingText += segment.source
      continue
    }
    flushText()
    blocks.push({
      type: "resource_link",
      name: path.basename(absolute),
      uri: fileUrl.value.href,
    })
  }
  flushText()
  if (blocks.length === 0) {
    blocks.push({ type: "text", text })
  }
  return blocks
})
