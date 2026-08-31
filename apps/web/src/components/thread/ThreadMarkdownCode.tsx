import { Option, Schema } from "effect"
import { isValidElement, type ComponentProps, type ReactNode } from "react"
import { CodeBlock, type ExtraProps, useIsCodeFenceIncomplete } from "streamdown"

import { useThreadMarkdownFileLinks } from "@/components/thread/thread-markdown-context"
import { ThreadMarkdownCodeBlock } from "@/components/thread/ThreadMarkdownCodeBlock"
import { ThreadMarkdownFileChip } from "@/components/thread/ThreadMarkdownFileChip"
import { ThreadMarkdownMermaid } from "@/components/thread/ThreadMarkdownMermaid"
import {
  isMermaidFenceLanguage,
  parseCodeFence,
  resolveCodeBlockFenceTitle,
  resolveCodeBlockLanguage,
} from "@/lib/code-fence"
import { fileLinkSuffixKey, resolveInlineCodeFileLinkMeta } from "@/lib/markdown-file-links"
import { cn } from "@/lib/utils"

const languageClassPattern = /language-(\S+)/
const startLineMetaPattern = /startLine=(\d+)/
const noLineNumbersMetaPattern = /\bnoLineNumbers\b/
const decodeCodeChildren = Schema.decodeUnknownOption(
  Schema.Union([Schema.String, Schema.Array(Schema.String)]),
)
const decodeMetastring = Schema.decodeUnknownOption(Schema.String)

const codeText = (children: ReactNode): string => {
  const decoded = Option.getOrUndefined(decodeCodeChildren(children))
  if (decoded !== undefined) {
    return [decoded].flat().join("")
  }

  if (isValidElement<{ children?: ReactNode }>(children)) {
    return codeText(children.props.children)
  }

  if (Array.isArray(children)) {
    return children.map((child) => codeText(child)).join("")
  }

  return ""
}

export function ThreadMarkdownCode({
  className,
  children,
  node,
  ...props
}: ComponentProps<"code"> & ExtraProps) {
  const isIncomplete = useIsCodeFenceIncomplete()
  const isInline = !("data-block" in props)
  const fileLinks = useThreadMarkdownFileLinks()

  if (isInline) {
    const span = codeText(children).trim()
    const meta =
      fileLinks.byInlineCode.get(span) ??
      resolveInlineCodeFileLinkMeta(span, fileLinks.workspaceRoot)
    if (meta !== null && meta !== undefined) {
      return (
        <ThreadMarkdownFileChip
          meta={meta}
          parentSuffix={fileLinks.parentSuffixByPath.get(fileLinkSuffixKey(meta))}
        />
      )
    }
    return (
      <code
        className={cn("rounded px-1.5 py-0.5 font-mono text-sm", className)}
        data-streamdown="inline-code"
        {...props}
      >
        {children}
      </code>
    )
  }

  const rawLanguage = className?.match(languageClassPattern)?.[1] ?? ""
  const fence = parseCodeFence(rawLanguage)
  const metastring = Option.getOrUndefined(decodeMetastring(node?.properties.metastring))
  const metaStart = metastring?.match(startLineMetaPattern)?.[1]
  const parsedMetaStart = metaStart === undefined ? undefined : Number.parseInt(metaStart, 10)
  const startLine =
    parsedMetaStart !== undefined && Number.isFinite(parsedMetaStart) && parsedMetaStart >= 1
      ? parsedMetaStart
      : (fence.startLine ?? 1)
  const lineNumbers = metastring === undefined || !noLineNumbersMetaPattern.test(metastring)
  const code = codeText(children)

  if (isMermaidFenceLanguage(resolveCodeBlockLanguage(fence))) {
    return <ThreadMarkdownMermaid chart={code} incomplete={isIncomplete} />
  }

  return (
    <ThreadMarkdownCodeBlock
      code={code}
      language={resolveCodeBlockLanguage(fence)}
      fenceTitle={resolveCodeBlockFenceTitle(fence, metastring)}
    >
      <CodeBlock
        className={className}
        code={code}
        isIncomplete={isIncomplete}
        language={fence.language}
        lineNumbers={lineNumbers}
        startLine={startLine}
      />
    </ThreadMarkdownCodeBlock>
  )
}
