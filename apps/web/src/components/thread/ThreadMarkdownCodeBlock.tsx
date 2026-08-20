import { FileCodeIcon, WrapTextIcon } from "lucide-react"
import { useState, type ReactNode } from "react"

import { CodeCopyButton } from "@/components/thread/CodeCopyButton"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip"

export function ThreadMarkdownCodeBlock({
  code,
  title,
  children,
}: {
  readonly code: string
  readonly title: string
  readonly children: ReactNode
}) {
  const [wrapped, setWrapped] = useState(false)
  const wrapLabel = wrapped ? "Désactiver le retour à la ligne" : "Ajuster les lignes"

  return (
    <div
      className="thread-markdown-codeblock my-2.5 overflow-hidden rounded-[var(--radius)] border leading-snug"
      data-language={title}
      data-wrap={wrapped ? "true" : "false"}
    >
      <div className="thread-markdown-codeblock-header flex items-center justify-between gap-2 pt-1.5 pr-1.5 pb-0 pl-3 select-none">
        <span className="inline-flex min-w-0 items-center gap-1.5 font-mono text-[0.6875rem]">
          <FileCodeIcon aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="truncate">{title}</span>
        </span>
        <span
          className="flex items-center gap-0.5"
          role="toolbar"
          aria-label="Actions du bloc de code"
        >
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="thread-markdown-codeblock-action"
                  aria-pressed={wrapped}
                  aria-label={wrapLabel}
                  onClick={() => {
                    setWrapped((value) => !value)
                  }}
                />
              }
            >
              <WrapTextIcon aria-hidden="true" />
            </TooltipTrigger>
            <TooltipPopup>{wrapLabel}</TooltipPopup>
          </Tooltip>
          <CodeCopyButton className="thread-markdown-codeblock-action" code={code} />
        </span>
      </div>
      {children}
    </div>
  )
}
