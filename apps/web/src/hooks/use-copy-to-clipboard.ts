import { Effect, Fiber } from "effect"
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
  const timeoutFiberRef = useRef<Fiber.Fiber<void> | null>(null)

  const clearCopiedTimeout = () => {
    const fiber = timeoutFiberRef.current
    if (fiber === null) {
      return
    }
    Effect.runFork(Fiber.interrupt(fiber))
    timeoutFiberRef.current = null
  }

  const copyToClipboard = (value: string): void => {
    if (value.length === 0) {
      return
    }

    void writeClipboardText(value).then(
      () => {
        clearCopiedTimeout()
        setIsCopied(true)
        onCopy?.()
        if (timeout !== 0) {
          timeoutFiberRef.current = Effect.runFork(
            Effect.sleep(timeout).pipe(
              Effect.andThen(
                Effect.sync(() => {
                  setIsCopied(false)
                  timeoutFiberRef.current = null
                }),
              ),
            ),
          )
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
      clearCopiedTimeout()
    }
  }, [])

  return { copyToClipboard, isCopied }
}
