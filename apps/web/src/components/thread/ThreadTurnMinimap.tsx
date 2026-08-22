import { useCallback, useEffect, useState, type KeyboardEvent, type MouseEvent } from "react"

import { ThreadPreviewMarkdown } from "@/components/thread/ThreadPreviewMarkdown"
import { useMessageScroller, useMessageScrollerVisibility } from "@/components/ui/message-scroller"
import {
  clipTurnMinimapMarkdown,
  compactTurnMinimapPreview,
  resolveTurnMinimapHasPersistentGutter,
  resolveTurnMinimapHeightStyle,
  resolveTurnMinimapHitStripWidth,
  resolveTurnMinimapIndexFromPointer,
  resolveTurnMinimapInteractiveWidth,
  resolveTurnMinimapTopPercent,
  turnMinimapItemIsInView,
  type TurnMinimapItem,
} from "@/lib/thread-turn-minimap"
import { cn } from "@/lib/utils"

const previewTargetsEvent = (target: EventTarget): boolean =>
  target instanceof Element && target.closest("[data-turn-minimap-preview]") !== null

export function ThreadTurnMinimap({ items }: { readonly items: ReadonlyArray<TurnMinimapItem> }) {
  const { scrollToMessage } = useMessageScroller()
  const { visibleMessageIds } = useMessageScrollerVisibility()
  const [viewportElement, setViewportElement] = useState<HTMLDivElement | null>(null)
  const [hasPersistentGutter, setHasPersistentGutter] = useState(false)
  const [hitStripWidth, setHitStripWidth] = useState(0)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  useEffect(() => {
    if (viewportElement === null) {
      return
    }

    const measure = () => {
      const viewportWidth = viewportElement.getBoundingClientRect().width
      const nextHasPersistentGutter = resolveTurnMinimapHasPersistentGutter(viewportWidth)
      setHasPersistentGutter((current) =>
        current === nextHasPersistentGutter ? current : nextHasPersistentGutter,
      )
      setHitStripWidth(resolveTurnMinimapHitStripWidth(viewportWidth))
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(viewportElement)
    return () => {
      observer.disconnect()
    }
  }, [viewportElement])

  const resolvedActiveIndex =
    activeIndex !== null && activeIndex < items.length ? activeIndex : null
  const activeItem = resolvedActiveIndex === null ? null : (items[resolvedActiveIndex] ?? null)
  const activeTopPercent =
    resolvedActiveIndex === null
      ? 0
      : resolveTurnMinimapTopPercent(resolvedActiveIndex, items.length)
  const activeTooltipTranslate =
    resolvedActiveIndex === null
      ? "-50%"
      : resolvedActiveIndex === 0
        ? "0%"
        : resolvedActiveIndex === items.length - 1
          ? "-100%"
          : "-50%"

  const resolveActiveIndexFromPointer = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      const rect = event.currentTarget.getBoundingClientRect()
      return resolveTurnMinimapIndexFromPointer({
        itemCount: items.length,
        railTop: rect.top,
        railHeight: rect.height,
        pointerY: event.clientY,
      })
    },
    [items.length],
  )

  const updateActiveIndexFromPointer = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      setActiveIndex(resolveActiveIndexFromPointer(event))
    },
    [resolveActiveIndexFromPointer],
  )

  const moveActiveIndex = useCallback(
    (delta: number) => {
      setActiveIndex((current) => {
        const base = current ?? 0
        return Math.max(0, Math.min(items.length - 1, base + delta))
      })
    },
    [items.length],
  )

  const selectItem = useCallback(
    (item: TurnMinimapItem) => {
      scrollToMessage(item.messageId, { align: "start", behavior: "smooth", scrollMargin: 24 })
    },
    [scrollToMessage],
  )

  return (
    <div
      ref={setViewportElement}
      className={cn(
        "group/turn-minimap pointer-events-none absolute inset-0 z-40 hidden [@media(pointer:fine)]:block",
        hasPersistentGutter
          ? "opacity-100"
          : "opacity-0 transition-opacity duration-150 hover:opacity-100 focus-within:opacity-100",
      )}
      data-persistent-gutter={hasPersistentGutter ? "true" : "false"}
      data-testid="thread-turn-minimap"
    >
      <div className="relative h-full w-18 select-none">
        <button
          aria-label={`Aller au tour : ${compactTurnMinimapPreview(activeItem?.userText) ?? "Tour"}`}
          className={cn(
            "absolute top-1/2 left-3 -translate-y-1/2 cursor-pointer bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
            hitStripWidth > 0 ? "pointer-events-auto" : "pointer-events-none",
          )}
          onBlur={() => setActiveIndex(null)}
          onClick={(event) => {
            if (previewTargetsEvent(event.target)) {
              return
            }
            const nextIndex = resolveActiveIndexFromPointer(event)
            const nextItem = nextIndex === null ? null : (items[nextIndex] ?? null)
            if (nextItem !== null) {
              selectItem(nextItem)
            }
            event.currentTarget.blur()
          }}
          onFocus={() => setActiveIndex((current) => current ?? 0)}
          onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
            if (event.key === "ArrowDown") {
              event.preventDefault()
              moveActiveIndex(1)
            } else if (event.key === "ArrowUp") {
              event.preventDefault()
              moveActiveIndex(-1)
            } else if (event.key === "Home") {
              event.preventDefault()
              setActiveIndex(0)
            } else if (event.key === "End") {
              event.preventDefault()
              setActiveIndex(items.length - 1)
            } else if (event.key === "Enter" || event.key === " ") {
              event.preventDefault()
              if (activeItem !== null) {
                selectItem(activeItem)
              }
            }
          }}
          onMouseLeave={() => setActiveIndex(null)}
          onMouseMove={updateActiveIndexFromPointer}
          onMouseDown={(event) => {
            if (previewTargetsEvent(event.target)) {
              return
            }
            event.preventDefault()
          }}
          style={{
            height: resolveTurnMinimapHeightStyle(items.length),
            width: resolveTurnMinimapInteractiveWidth(hitStripWidth, activeItem !== null),
          }}
          type="button"
        >
          <div className="absolute top-0 left-3 h-full w-px bg-border/15" />
          {items.map((item, index) => {
            const top = `${String(resolveTurnMinimapTopPercent(index, items.length))}%`
            const activeDistance =
              resolvedActiveIndex === null ? null : Math.abs(index - resolvedActiveIndex)
            const inView = turnMinimapItemIsInView(item, visibleMessageIds)
            return (
              <span
                aria-hidden="true"
                className={cn(
                  "pointer-events-none absolute left-0 h-0.5 -translate-y-1/2 rounded-full bg-muted-foreground/35 transition-[background-color,width] duration-150",
                  inView && "bg-foreground/90",
                  activeDistance === 0
                    ? "w-6 bg-muted-foreground/75"
                    : activeDistance === 1
                      ? "w-4"
                      : activeDistance === 2
                        ? "w-2.5"
                        : "w-2",
                )}
                data-in-view={inView ? "true" : "false"}
                data-turn-minimap-strip
                key={item.messageId}
                style={{ top }}
              />
            )
          })}
          {activeItem === null ? null : (
            <span
              className="pointer-events-auto absolute left-8 w-80 cursor-text select-text"
              data-turn-minimap-preview
              onMouseMove={(event) => event.stopPropagation()}
              style={{
                top: `${String(activeTopPercent)}%`,
                transform: `translateY(${activeTooltipTranslate})`,
              }}
            >
              <div className="thread-minimap-preview rounded-xl border bg-popover p-3 text-left text-popover-foreground shadow-lg/5">
                <div
                  className="max-w-full overflow-hidden text-sm font-medium leading-5 [&_*]:my-0"
                  style={{
                    display: "-webkit-box",
                    WebkitBoxOrient: "vertical",
                    WebkitLineClamp: 1,
                  }}
                >
                  <ThreadPreviewMarkdown
                    className="text-sm font-medium leading-5"
                    text={clipTurnMinimapMarkdown(activeItem.userText ?? "Tour")}
                  />
                </div>
                {activeItem.assistantText === null ? null : (
                  <div
                    className="mt-1 overflow-hidden text-muted-foreground text-sm leading-5"
                    style={{
                      display: "-webkit-box",
                      WebkitBoxOrient: "vertical",
                      WebkitLineClamp: 3,
                    }}
                  >
                    <ThreadPreviewMarkdown
                      className="text-sm leading-5 [&_p]:my-0"
                      text={clipTurnMinimapMarkdown(activeItem.assistantText)}
                    />
                  </div>
                )}
              </div>
            </span>
          )}
        </button>
      </div>
    </div>
  )
}
