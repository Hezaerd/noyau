import type { ComponentProps } from "react"
import type { ExtraProps } from "streamdown"

import { useThreadMarkdownFileLinks } from "@/components/thread/thread-markdown-context"
import { ThreadMarkdownFileChip } from "@/components/thread/ThreadMarkdownFileChip"
import {
  decodeThreadMarkdownFileHref,
  fileLinkSuffixKey,
  normalizeMarkdownLinkHrefKey,
  resolveMarkdownFileLinkMeta,
} from "@/lib/markdown-file-links"

export function ThreadMarkdownLink({
  href,
  children,
  className,
  node: _node,
  ...props
}: ComponentProps<"a"> & ExtraProps) {
  const fileLinks = useThreadMarkdownFileLinks()
  const encodedTarget = href === undefined ? null : decodeThreadMarkdownFileHref(href)
  const normalizedHref =
    href === undefined ? "" : normalizeMarkdownLinkHrefKey(encodedTarget ?? href)
  const meta =
    normalizedHref.length === 0
      ? undefined
      : (fileLinks.byHref.get(normalizedHref) ??
        resolveMarkdownFileLinkMeta(normalizedHref, fileLinks.workspaceRoot) ??
        undefined)

  if (meta !== undefined) {
    return (
      <ThreadMarkdownFileChip
        className={className}
        meta={meta}
        parentSuffix={fileLinks.parentSuffixByPath.get(fileLinkSuffixKey(meta))}
      />
    )
  }

  return (
    <a {...props} className={className} href={href}>
      {children}
    </a>
  )
}
