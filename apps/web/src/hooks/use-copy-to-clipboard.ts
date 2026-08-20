import { useEffect, useRef, useState } from "react"

import { writeClipboardText } from "@/lib/clipboard"

export interface UseCopyToClipboardOptions {
  readonly timeout?: number
  readonly onCopy?: () => void
  readonly onError?: () => void
}

export interface UseCopyToClipboardResult {
  readonly copyToClipboard: (value: string) => void
  readonly isCopied: boolean
}

export function useCopyToClipboard({
  timeout = 2000,
  onCopy,
  onError,
}: UseCopyToClipboardOptions = {}): UseCopyToClipboardResult {
  const [isCopied, setIsCopied] = useState(false)
  const timeoutIdRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const copyToClipboard = (value: string): void => {
    if (value.length === 0) {
      return
    }

    void writeClipboardText(value).then(
      () => {
        if (timeoutIdRef.current !== null) {
          clearTimeout(timeoutIdRef.current)
        }
        setIsCopied(true)
        onCopy?.()
        if (timeout !== 0) {
          timeoutIdRef.current = setTimeout(() => {
            setIsCopied(false)
            timeoutIdRef.current = null
          }, timeout)
        }
        return undefined
      },
      () => {
        onError?.()
        return undefined
      },
    )
  }

  useEffect(() => {
    return () => {
      if (timeoutIdRef.current !== null) {
        clearTimeout(timeoutIdRef.current)
      }
    }
  }, [])

  return { copyToClipboard, isCopied }
}
