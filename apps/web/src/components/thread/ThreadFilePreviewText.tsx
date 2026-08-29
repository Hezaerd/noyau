import { useMemo } from "react"

import { ThreadPreviewMarkdown } from "@/components/thread/ThreadPreviewMarkdown"
import { filePreviewMarkdown, isMarkdownFilePath } from "@/lib/file-preview-markdown"

export function ThreadFilePreviewText({
  path,
  text,
}: {
  readonly path: string
  readonly text: string
}) {
  const markdown = useMemo(() => filePreviewMarkdown(path, text), [path, text])
  const kind = isMarkdownFilePath(path) ? "markdown" : "code"

  return (
    <div className="thread-file-preview" data-file-preview-kind={kind}>
      <ThreadPreviewMarkdown
        className={kind === "markdown" ? "text-[11px] leading-relaxed" : "thread-file-preview-code"}
        diagrams={kind === "markdown"}
        text={markdown}
      />
    </div>
  )
}
