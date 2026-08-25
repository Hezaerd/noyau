import { memo } from "react"
import { Streamdown } from "streamdown"

import { threadMarkdownPlugins } from "@/lib/thread-markdown-plugins"
import { cn } from "@/lib/utils"

export const threadPreviewMarkdownClassName =
  "thread-preview-markdown max-w-none [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-2 [&_h1]:text-sm [&_h1]:font-semibold [&_h2]:text-xs [&_h2]:font-semibold [&_li]:ml-4 [&_ol]:list-decimal [&_p]:my-1.5 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_ul]:list-disc"

const streamdownControls = { code: { copy: false, download: false }, table: false } as const

export const ThreadPreviewMarkdown = memo(function ThreadPreviewMarkdown({
  text,
  className,
}: {
  readonly text: string
  readonly className?: string | undefined
}) {
  return (
    <Streamdown
      className={cn(threadPreviewMarkdownClassName, className)}
      controls={streamdownControls}
      mode="static"
      plugins={threadMarkdownPlugins}
      skipHtml
    >
      {text}
    </Streamdown>
  )
})
