import { memo, useMemo } from "react"
import { Streamdown } from "streamdown"

import { useAppearance } from "@/hooks/use-appearance"
import { useMediaQuery } from "@/hooks/use-media-query"
import { resolveAppearance } from "@/lib/appearance"
import { mermaidConfigForAppearance } from "@/lib/thread-markdown-mermaid"
import { threadMarkdownPlugins, threadPreviewMarkdownPlugins } from "@/lib/thread-markdown-plugins"
import { cn } from "@/lib/utils"

export const threadPreviewMarkdownClassName =
  "thread-preview-markdown max-w-none [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-2 [&_h1]:text-sm [&_h1]:font-semibold [&_h2]:text-xs [&_h2]:font-semibold [&_li]:ml-4 [&_ol]:list-decimal [&_p]:my-1.5 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_ul]:list-disc"

const streamdownControls = {
  code: { copy: false, download: false },
  mermaid: { copy: true, download: false, fullscreen: true, panZoom: false },
  table: false,
} as const

export const ThreadPreviewMarkdown = memo(function ThreadPreviewMarkdown({
  text,
  className,
  diagrams = false,
}: {
  readonly text: string
  readonly className?: string | undefined
  readonly diagrams?: boolean | undefined
}) {
  const { preference } = useAppearance()
  const systemDark = useMediaQuery("(prefers-color-scheme: dark)")
  const appearance = resolveAppearance(preference, systemDark)
  const mermaid = useMemo(() => ({ config: mermaidConfigForAppearance(appearance) }), [appearance])

  return (
    <Streamdown
      className={cn(threadPreviewMarkdownClassName, className)}
      controls={streamdownControls}
      {...(diagrams ? { mermaid } : {})}
      mode="static"
      plugins={diagrams ? threadMarkdownPlugins : threadPreviewMarkdownPlugins}
      skipHtml
    >
      {text}
    </Streamdown>
  )
})
