import { createCodePlugin } from "@streamdown/code"
import { math } from "@streamdown/math"
import { Streamdown } from "streamdown"

import { ThreadMarkdownCode } from "@/components/thread/ThreadMarkdownCode"
import { ThreadMarkdownTable } from "@/components/thread/ThreadMarkdownTable"

const markdownClassName =
  "max-w-none text-sm leading-6 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_li]:ml-5 [&_ol]:list-decimal [&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_ul]:list-disc"

const threadCodePlugin = createCodePlugin({
  themes: ["one-dark-pro", "one-dark-pro"],
})

const streamdownComponents = {
  code: ThreadMarkdownCode,
  table: ThreadMarkdownTable,
}

export function ThreadMarkdown({
  text,
  streaming = false,
}: {
  readonly text: string
  readonly streaming?: boolean
}) {
  return (
    <Streamdown
      className={markdownClassName}
      components={streamdownComponents}
      controls={{ code: { copy: false, download: false }, table: false }}
      isAnimating={streaming}
      mode={streaming ? "streaming" : "static"}
      plugins={{ code: threadCodePlugin, math }}
      skipHtml
    >
      {text}
    </Streamdown>
  )
}
