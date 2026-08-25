import { CheckIcon, CopyIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { toastManager } from "@/components/ui/toast"
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip"
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard"
import { cn } from "@/lib/utils"

const MESSAGE_COPIED_TOAST_ID = "thread-message-copied"

export function MessageCopyButton({
  className,
  text,
}: {
  readonly className?: string
  readonly text: string
}) {
  const { copyToClipboard, isCopied } = useCopyToClipboard({
    onCopy: () => {
      toastManager.add({
        description: "Le message est dans le presse-papiers.",
        id: MESSAGE_COPIED_TOAST_ID,
        title: "Copié",
        type: "success",
      })
    },
    onError: () => {
      toastManager.add({
        description: "Le presse-papiers a refusé le message.",
        title: "Copie impossible",
        type: "error",
      })
    },
  })

  const copyLabel = isCopied ? "Copié" : "Copier le message"

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label="Copier le message"
            className={cn("text-muted-foreground hover:text-foreground", className)}
            onClick={() => {
              copyToClipboard(text)
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
