import { WrapTextIcon } from "lucide-react"
import { useState, type ReactNode } from "react"

import { PierreEntryIcon } from "@/components/PierreEntryIcon"
import { CodeCopyButton } from "@/components/thread/CodeCopyButton"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip"
import {
  hasSpecificPierreIconForFileName,
  syntheticFileNameForLanguageId,
} from "@/lib/pierre-icons"

/**
 * Filename titles render icon + text; language-only titles render just the
 * icon (redundant next to its own name) and fall back to the language text
 * when no specific icon exists.
 */
function ThreadMarkdownCodeBlockTitle({
  fenceTitle,
  language,
}: {
  readonly fenceTitle: string | null
  readonly language: string
}) {
  if (fenceTitle !== null) {
    return (
      <>
        <PierreEntryIcon pathValue={fenceTitle} kind="file" className="size-3.5" />
        <span className="truncate">{fenceTitle}</span>
      </>
    )
  }

  const fileName = syntheticFileNameForLanguageId(language)
  if (!hasSpecificPierreIconForFileName(fileName)) {
    return <span className="truncate">{language}</span>
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="inline-flex shrink-0 rounded-sm" aria-label={`Langage : ${language}`} />
        }
      >
        <PierreEntryIcon pathValue={fileName} kind="file" className="size-3.5" />
      </TooltipTrigger>
      <TooltipPopup>{language}</TooltipPopup>
    </Tooltip>
  )
}

export function ThreadMarkdownCodeBlock({
  code,
  language,
  fenceTitle,
  children,
}: {
  readonly code: string
  readonly language: string
  readonly fenceTitle: string | null
  readonly children: ReactNode
}) {
  const [wrapped, setWrapped] = useState(false)
  const wrapLabel = wrapped ? "Désactiver le retour à la ligne" : "Ajuster les lignes"

  return (
    <div
      className="thread-markdown-codeblock my-2.5 overflow-hidden rounded-[var(--radius)] border leading-snug"
      data-language={language}
      data-wrap={wrapped ? "true" : "false"}
    >
      <div className="thread-markdown-codeblock-header flex items-center justify-between gap-2 pt-1.5 pr-1.5 pb-0 pl-3 select-none">
        <span className="inline-flex min-w-0 items-center gap-1.5 font-mono text-[0.6875rem]">
          <ThreadMarkdownCodeBlockTitle fenceTitle={fenceTitle} language={language} />
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
