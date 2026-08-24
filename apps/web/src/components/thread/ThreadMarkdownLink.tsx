import { GlobeIcon } from "lucide-react"
import { memo, useState, type ComponentProps } from "react"
import type { ExtraProps } from "streamdown"

import { useThreadMarkdownFileLinks } from "@/components/thread/thread-markdown-context"
import { ThreadMarkdownFileChip } from "@/components/thread/ThreadMarkdownFileChip"
import { ThreadMarkdownTicketChip } from "@/components/thread/ThreadMarkdownTicketChip"
import { composerTicketById } from "@/lib/composer-tickets"
import {
  markdownExternalLinkFaviconFailed,
  markdownExternalLinkFaviconSrc,
  rememberMarkdownExternalLinkFaviconFailure,
  resolveExternalWebLinkHost,
} from "@/lib/markdown-external-links"
import { parseTicketMarkdownHref } from "@/lib/markdown-file-links"
import { fileLinkSuffixKey, lookupThreadMarkdownFileLinkMeta } from "@/lib/markdown-file-links"
import { cn } from "@/lib/utils"

const MARKDOWN_LINK_FAVICON_CLASS_NAME = "block size-full shrink-0 select-none"

const ThreadMarkdownLinkFavicon = memo(function ThreadMarkdownLinkFavicon({
  host,
}: {
  readonly host: string
}) {
  const [failedHost, setFailedHost] = useState<string | null>(null)
  const showGlobe = failedHost === host || markdownExternalLinkFaviconFailed(host)
  return (
    <span
      className="ms-[0.25em] me-[0.2em] inline-flex size-[14px] [vertical-align:-0.125em]"
      aria-hidden
    >
      {showGlobe ? (
        <GlobeIcon
          className={MARKDOWN_LINK_FAVICON_CLASS_NAME}
          data-thread-markdown-link-globe=""
        />
      ) : (
        <img
          src={markdownExternalLinkFaviconSrc(host)}
          alt=""
          loading="lazy"
          draggable={false}
          className={cn(MARKDOWN_LINK_FAVICON_CLASS_NAME, "rounded-sm")}
          data-thread-markdown-link-favicon=""
          onError={() => {
            rememberMarkdownExternalLinkFaviconFailure(host)
            setFailedHost(host)
          }}
        />
      )}
    </span>
  )
})

export function ThreadMarkdownLink({
  href,
  children,
  className,
  node: _node,
  ...props
}: ComponentProps<"a"> & ExtraProps) {
  const fileLinks = useThreadMarkdownFileLinks()
  const ticketId = parseTicketMarkdownHref(href)
  if (ticketId !== null) {
    const ticket = composerTicketById(fileLinks.tickets ?? [], ticketId)
    return (
      <ThreadMarkdownTicketChip
        ticketId={ticketId}
        title={ticket?.title ?? "Ticket"}
        href={
          fileLinks.projectId === undefined
            ? (href ?? `ticket:${ticketId}`)
            : `/projects/${fileLinks.projectId}/board?ticket=${ticketId}`
        }
        {...(ticket === undefined ? {} : { columnName: ticket.columnName })}
        {...(className === undefined ? {} : { className })}
        {...(fileLinks.onOpenTicket === undefined ? {} : { onOpenTicket: fileLinks.onOpenTicket })}
      />
    )
  }

  const meta = lookupThreadMarkdownFileLinkMeta(href, fileLinks)

  if (meta !== undefined) {
    return (
      <ThreadMarkdownFileChip
        className={className}
        meta={meta}
        parentSuffix={fileLinks.parentSuffixByPath.get(fileLinkSuffixKey(meta))}
      />
    )
  }

  const host = resolveExternalWebLinkHost(href)
  const isSameDocumentLink = href?.startsWith("#") ?? false

  return (
    <a
      {...props}
      className={className}
      data-thread-markdown-external-link={host === null ? undefined : ""}
      href={href}
      rel={isSameDocumentLink ? undefined : "noopener noreferrer"}
      target={isSameDocumentLink ? undefined : "_blank"}
    >
      {host === null ? null : <ThreadMarkdownLinkFavicon host={host} />}
      {children}
    </a>
  )
}
