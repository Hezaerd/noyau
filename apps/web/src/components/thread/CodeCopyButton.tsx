import { CheckIcon, CopyIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { toastManager } from "@/components/ui/toast"
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip"
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard"

const CODE_COPIED_TOAST_ID = "thread-markdown-code-copied"

export function CodeCopyButton({
  className,
  code,
}: {
  readonly className?: string
  readonly code: string
}) {
  const { copyToClipboard, isCopied } = useCopyToClipboard({
    onCopy: () => {
      toastManager.add({
        description: "The code block is on the clipboard.",
        id: CODE_COPIED_TOAST_ID,
        title: "Copied",
        type: "success",
      })
    },
    onError: () => {
      toastManager.add({
        description: "The clipboard refused the code block.",
        title: "Unable to copy",
        type: "error",
      })
    },
  })

  const copyLabel = isCopied ? "Copied" : "Copy code"

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label="Copy code"
            className={className}
            onClick={() => {
              copyToClipboard(code)
            }}
            size="icon-xs"
            variant="ghost"
          />
        }
      >
        {isCopied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
      </TooltipTrigger>
      <TooltipPopup>{copyLabel}</TooltipPopup>
    </Tooltip>
  )
}
