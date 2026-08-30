import { Maximize2Icon } from "lucide-react"
import { useEffect, useId, useState } from "react"

import { CodeCopyButton } from "@/components/thread/CodeCopyButton"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip"
import { useAppearance } from "@/hooks/use-appearance"
import { useMediaQuery } from "@/hooks/use-media-query"
import { resolveAppearance } from "@/lib/appearance"
import { renderThreadMermaidChart } from "@/lib/thread-markdown-mermaid"

export function ThreadMarkdownMermaid({
  chart,
  incomplete,
}: {
  readonly chart: string
  readonly incomplete: boolean
}) {
  const { preference } = useAppearance()
  const systemDark = useMediaQuery("(prefers-color-scheme: dark)")
  const appearance = resolveAppearance(preference, systemDark)
  const titleId = useId()
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)
  const [showSource, setShowSource] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    if (incomplete) {
      return
    }

    let cancelled = false
    setError(null)
    setSvg(null)

    void renderThreadMermaidChart(chart, appearance).then((result) => {
      if (cancelled) {
        return undefined
      }
      if (result._tag === "ok") {
        setSvg(result.svg)
        setShowSource(false)
        return undefined
      }
      setSvg(null)
      setError(result.message)
      return undefined
    })

    return () => {
      cancelled = true
    }
  }, [appearance, chart, incomplete, retryKey])

  const state =
    incomplete || (error === null && svg === null) ? "pending" : error === null ? "ready" : "error"

  return (
    <div
      className="thread-markdown-mermaid thread-markdown-codeblock my-2.5 overflow-hidden rounded-[var(--radius)] border"
      data-thread-markdown-mermaid={state}
    >
      <div className="thread-markdown-codeblock-header flex items-center justify-between gap-2 pt-1.5 pr-1.5 pb-0 pl-3 select-none">
        <span className="inline-flex min-w-0 items-center gap-1.5 font-mono text-[0.6875rem]">
          mermaid
        </span>
        <span className="flex items-center gap-0.5" role="toolbar" aria-label="Diagram actions">
          {svg === null ? null : (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-label="View diagram fullscreen"
                    className="thread-markdown-codeblock-action"
                    onClick={() => {
                      setFullscreen(true)
                    }}
                    size="icon-xs"
                    variant="ghost"
                  />
                }
              >
                <Maximize2Icon aria-hidden="true" />
              </TooltipTrigger>
              <TooltipPopup>View fullscreen</TooltipPopup>
            </Tooltip>
          )}
          <CodeCopyButton className="thread-markdown-codeblock-action" code={chart} />
        </span>
      </div>
      {incomplete || (error === null && svg === null) ? (
        <p className="m-0 px-3 py-6 text-muted-foreground text-sm">Diagram</p>
      ) : error === null && svg !== null ? (
        <div
          className="thread-markdown-mermaid-svg max-w-full overflow-x-auto px-3 py-3"
          dangerouslySetInnerHTML={{ __html: svg }}
          data-thread-markdown-mermaid-svg=""
        />
      ) : (
        <div className="flex flex-col gap-2 px-3 py-3">
          <p className="m-0 text-sm">Couldn't render this diagram.</p>
          <p className="m-0 text-muted-foreground text-xs">{error}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => {
                setRetryKey((value) => value + 1)
              }}
              size="sm"
              variant="outline"
            >
              Try again
            </Button>
            <Button
              onClick={() => {
                setShowSource((value) => !value)
              }}
              size="sm"
              variant="ghost"
            >
              {showSource ? "Hide source" : "Show source"}
            </Button>
          </div>
          {showSource ? (
            <pre className="m-0 overflow-x-auto rounded-[var(--radius)] bg-background/60 p-2 font-mono text-xs leading-5">
              {chart}
            </pre>
          ) : null}
        </div>
      )}
      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setFullscreen(false)
          }
        }}
        open={fullscreen}
      >
        <DialogPopup
          bottomStickOnMobile={false}
          className="h-[min(92vh,calc(100dvh-2rem))] max-h-[min(92vh,calc(100dvh-2rem))] w-[min(92vw,calc(100%-2rem))] max-w-[min(92vw,calc(100%-2rem))]"
        >
          <DialogHeader>
            <DialogTitle id={titleId}>Diagram</DialogTitle>
            <DialogDescription>Rendered from the mermaid source in this message.</DialogDescription>
          </DialogHeader>
          {svg === null ? null : (
            <div
              className="thread-markdown-mermaid-svg thread-markdown-mermaid-svg-expanded min-h-0 flex-1 overflow-auto px-6 pb-6"
              dangerouslySetInnerHTML={{ __html: svg }}
              data-thread-markdown-mermaid-expanded=""
            />
          )}
        </DialogPopup>
      </Dialog>
    </div>
  )
}
