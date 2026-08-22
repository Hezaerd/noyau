import type { ProjectId } from "@noyau/protocol/ids"
import { createCodePlugin } from "@streamdown/code"
import { math } from "@streamdown/math"
import { useCallback, useMemo } from "react"
import { defaultUrlTransform, Streamdown, type ExtraProps } from "streamdown"

import { ThreadMarkdownContext } from "@/components/thread/thread-markdown-context"
import { ThreadMarkdownCode } from "@/components/thread/ThreadMarkdownCode"
import { ThreadMarkdownLink } from "@/components/thread/ThreadMarkdownLink"
import { ThreadMarkdownTable } from "@/components/thread/ThreadMarkdownTable"
import {
  collectThreadMarkdownFileLinks,
  rewriteMarkdownFileLinkDestinations,
  transformThreadMarkdownFileHref,
} from "@/lib/markdown-file-links"

const markdownClassName =
  "max-w-none text-sm leading-6 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_li]:ml-5 [&_ol]:list-decimal [&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_ul]:list-disc"

const threadCodePlugin = createCodePlugin({
  themes: ["one-dark-pro", "one-dark-pro"],
})

const streamdownComponents = {
  a: ThreadMarkdownLink,
  code: ThreadMarkdownCode,
  table: ThreadMarkdownTable,
}

export function ThreadMarkdown({
  text,
  streaming = false,
  workspaceRoot,
  projectId,
}: {
  readonly text: string
  readonly streaming?: boolean
  readonly workspaceRoot?: string | undefined
  readonly projectId?: ProjectId | undefined
}) {
  const fileLinks = useMemo(
    () => ({ ...collectThreadMarkdownFileLinks(text, workspaceRoot), projectId }),
    [projectId, text, workspaceRoot],
  )
  const renderedText = useMemo(
    () => rewriteMarkdownFileLinkDestinations(text, workspaceRoot),
    [text, workspaceRoot],
  )
  const urlTransform = useCallback(
    (href: string, key: string, node: NonNullable<ExtraProps["node"]>) =>
      transformThreadMarkdownFileHref(href, workspaceRoot) ?? defaultUrlTransform(href, key, node),
    [workspaceRoot],
  )

  return (
    <ThreadMarkdownContext.Provider value={fileLinks}>
      <Streamdown
        className={markdownClassName}
        components={streamdownComponents}
        controls={{ code: { copy: false, download: false }, table: false }}
        isAnimating={streaming}
        mode={streaming ? "streaming" : "static"}
        plugins={{ code: threadCodePlugin, math }}
        skipHtml
        urlTransform={urlTransform}
      >
        {renderedText}
      </Streamdown>
    </ThreadMarkdownContext.Provider>
  )
}
