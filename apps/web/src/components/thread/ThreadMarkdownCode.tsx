import { Option, Schema } from "effect"
import { isValidElement, type ComponentProps, type ReactNode } from "react"
import { CodeBlock, type ExtraProps, useIsCodeFenceIncomplete } from "streamdown"

import { CodeCopyButton } from "@/components/thread/CodeCopyButton"
import { parseCodeFence } from "@/lib/code-fence"
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

  if (isInline) {
    return (
      <code
        className={cn("rounded bg-muted px-1.5 py-0.5 font-mono text-sm", className)}
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

  return (
    <div className="relative">
      <CodeBlock
        className={className}
        code={code}
        isIncomplete={isIncomplete}
        language={fence.language}
        lineNumbers={lineNumbers}
        startLine={startLine}
      />
      <div className="absolute top-1.5 right-1.5 z-10">
        <CodeCopyButton code={code} />
      </div>
    </div>
  )
}
