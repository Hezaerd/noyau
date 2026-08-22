import { useMemo } from "react"
import { Streamdown } from "streamdown"

import { filePreviewMarkdown, isMarkdownFilePath } from "@/lib/file-preview-markdown"
import { threadMarkdownPlugins } from "@/lib/thread-markdown-plugins"

const previewMarkdownClassName =
  "max-w-none text-[11px] leading-relaxed [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-2 [&_h1]:text-sm [&_h1]:font-semibold [&_h2]:text-xs [&_h2]:font-semibold [&_li]:ml-4 [&_ol]:list-decimal [&_p]:my-1.5 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_ul]:list-disc"

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
      <Streamdown
        className={kind === "markdown" ? previewMarkdownClassName : "thread-file-preview-code"}
        controls={{ code: { copy: false, download: false }, table: false }}
        mode="static"
        plugins={threadMarkdownPlugins}
        skipHtml
      >
        {markdown}
      </Streamdown>
    </div>
  )
}
