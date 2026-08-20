import { CheckIcon, CopyIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { toastManager } from "@/components/ui/toast"
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard"

const CODE_COPIED_TOAST_ID = "thread-markdown-code-copied"

export function CodeCopyButton({ code }: { readonly code: string }) {
  const { copyToClipboard, isCopied } = useCopyToClipboard({
    onCopy: () => {
      toastManager.add({
        description: "Le bloc de code est dans le presse-papiers.",
        id: CODE_COPIED_TOAST_ID,
        title: "Copié",
        type: "success",
      })
    },
  })

  return (
    <Button
      aria-label="Copier le code"
      onClick={() => {
        copyToClipboard(code)
      }}
      size="icon-xs"
      variant="ghost"
    >
      {isCopied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
    </Button>
  )
}
