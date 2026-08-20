import { useEffect, useRef, useState } from "react"

export interface UseCopyToClipboardOptions {
  readonly timeout?: number
  readonly onCopy?: () => void
}

export interface UseCopyToClipboardResult {
  readonly copyToClipboard: (value: string) => void
  readonly isCopied: boolean
}

export function useCopyToClipboard({
  timeout = 2000,
  onCopy,
}: UseCopyToClipboardOptions = {}): UseCopyToClipboardResult {
  const [isCopied, setIsCopied] = useState(false)
  const timeoutIdRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const copyToClipboard = (value: string): void => {
    const clipboard = globalThis.navigator.clipboard
    if (clipboard.writeText === undefined || value.length === 0) {
      return
    }

    void clipboard.writeText(value).then(() => {
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
    }, console.error)
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
