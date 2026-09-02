import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react"

import { useComposerToolbarStore } from "@/components/thread/composer-toolbar-context"
import {
  type ComposerToolbarOpenResult,
  type ComposerToolbarPlacement,
  type ToolbarAreaOccupied,
} from "@/lib/composer-toolbar"

export type UseComposerToolbarOptions = {
  /** Stable identity for the owner of this placement while its lifecycle is active. */
  readonly id: string
  readonly placement: ComposerToolbarPlacement
  readonly content: ReactNode
  /** When omitted, the owner controls open/close imperatively. */
  readonly active?: boolean | undefined
  readonly onOpenFailure?: ((failure: ToolbarAreaOccupied) => void) | undefined
}

export type UseComposerToolbarResult = {
  readonly open: () => ComposerToolbarOpenResult
  readonly close: () => void
  readonly isOpen: boolean
  readonly failure: ToolbarAreaOccupied | undefined
}

export function useComposerToolbar({
  id,
  placement,
  content,
  active,
  onOpenFailure,
}: UseComposerToolbarOptions): UseComposerToolbarResult {
  const store = useComposerToolbarStore()
  const ownerRef = useRef<symbol>(undefined)
  if (ownerRef.current === undefined) {
    ownerRef.current = Symbol("composer-toolbar-owner")
  }
  const owner = ownerRef.current
  const contentRef = useRef(content)
  contentRef.current = content
  const render = useCallback(() => contentRef.current, [])
  const leaseRef = useRef<(() => void) | undefined>(undefined)
  const [isOpen, setIsOpen] = useState(false)
  const [failure, setFailure] = useState<ToolbarAreaOccupied>()
  const open = useCallback(() => {
    const result = store.open(owner, { id, placement, render })
    if (result.ok) {
      const release = () => {
        if (leaseRef.current !== release) {
          return
        }
        leaseRef.current = undefined
        result.close()
        setIsOpen(false)
      }
      leaseRef.current = release
      setIsOpen(true)
      setFailure(undefined)
      return { ...result, close: release }
    } else {
      setFailure(result.failure)
      onOpenFailure?.(result.failure)
    }
    return result
  }, [id, onOpenFailure, owner, placement, render, store])
  const close = useCallback(() => {
    leaseRef.current?.()
    setFailure(undefined)
  }, [])

  useLayoutEffect(() => {
    if (active === undefined) {
      return undefined
    }
    if (!active) {
      close()
      return undefined
    }
    const result = open()
    return result.ok ? result.close : undefined
  }, [active, close, open])

  useLayoutEffect(() => {
    store.refresh(owner, placement)
  }, [content, owner, placement, store])

  return {
    open,
    close,
    isOpen,
    failure,
  }
}
