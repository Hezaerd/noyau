import type { ProjectId } from "@noyau/contracts/ids"
import { memo, useCallback, useMemo } from "react"
import { defaultUrlTransform, Streamdown, type ExtraProps } from "streamdown"

import { ThreadMarkdownContext } from "@/components/thread/thread-markdown-context"
import { ThreadMarkdownCode } from "@/components/thread/ThreadMarkdownCode"
import { ThreadMarkdownImage } from "@/components/thread/ThreadMarkdownImage"
import { ThreadMarkdownLink } from "@/components/thread/ThreadMarkdownLink"
import { ThreadMarkdownTable } from "@/components/thread/ThreadMarkdownTable"
import { EMPTY_COMPOSER_TICKETS, type ComposerTicket } from "@/lib/composer-tickets"
import {
  collectThreadMarkdownFileLinks,
  rewriteComposerMentionsToMarkdownFileLinks,
  rewriteMarkdownFileLinkDestinations,
  transformThreadMarkdownFileHref,
  transformThreadMarkdownTicketHref,
} from "@/lib/markdown-file-links"
import { threadMarkdownPlugins } from "@/lib/thread-markdown-plugins"

const markdownClassName =
  "thread-markdown max-w-none text-sm leading-6 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_li]:ml-5 [&_ol]:list-decimal [&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_ul]:list-disc"

const streamdownComponents = {
  a: ThreadMarkdownLink,
  code: ThreadMarkdownCode,
  img: ThreadMarkdownImage,
  table: ThreadMarkdownTable,
}

const streamdownControls = { code: { copy: false, download: false }, table: false } as const

export const ThreadMarkdown = memo(function ThreadMarkdown({
  text,
  streaming = false,
  workspaceRoot,
  projectId,
  tickets = EMPTY_COMPOSER_TICKETS,
  onOpenTicket,
}: {
  readonly text: string
  readonly streaming?: boolean
  readonly workspaceRoot?: string | undefined
  readonly projectId?: ProjectId | undefined
  readonly tickets?: ReadonlyArray<ComposerTicket> | undefined
  readonly onOpenTicket?: ((ticketId: string) => void) | undefined
}) {
  const mentionExpanded = useMemo(
    () => (streaming ? text : rewriteComposerMentionsToMarkdownFileLinks(text, tickets)),
    [streaming, text, tickets],
  )
  const fileLinks = useMemo(
    () =>
      Object.assign(
        collectThreadMarkdownFileLinks(mentionExpanded, workspaceRoot),
        { tickets },
        projectId === undefined ? {} : { projectId },
        onOpenTicket === undefined ? {} : { onOpenTicket },
      ),
    [mentionExpanded, onOpenTicket, projectId, tickets, workspaceRoot],
  )
  const renderedText = useMemo(
    () =>
      streaming
        ? mentionExpanded
        : rewriteMarkdownFileLinkDestinations(mentionExpanded, workspaceRoot),
    [mentionExpanded, streaming, workspaceRoot],
  )
  const urlTransform = useCallback(
    (href: string, key: string, node: NonNullable<ExtraProps["node"]>) => {
      const ticketHref = transformThreadMarkdownTicketHref(href)
      if (ticketHref !== null) {
        return ticketHref
      }
      return (
        transformThreadMarkdownFileHref(href, workspaceRoot) ?? defaultUrlTransform(href, key, node)
      )
    },
    [workspaceRoot],
  )

  return (
    <ThreadMarkdownContext.Provider value={fileLinks}>
      <Streamdown
        className={markdownClassName}
        components={streamdownComponents}
        controls={streamdownControls}
        isAnimating={streaming}
        mode={streaming ? "streaming" : "static"}
        plugins={threadMarkdownPlugins}
        skipHtml
        urlTransform={urlTransform}
      >
        {renderedText}
      </Streamdown>
    </ThreadMarkdownContext.Provider>
  )
})
