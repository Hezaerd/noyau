import { TicketIcon } from "lucide-react"
import { useLayoutEffect, useRef, useState } from "react"

import { PierreEntryIcon } from "@/components/PierreEntryIcon"
import { composerPathListCanScrollDown } from "@/lib/composer-path-menu"
import type { ComposerMentionEntry } from "@/lib/composer-tickets"
import { basenameOfPath } from "@/lib/pierre-icons"

const directoryOfPath = (relativePath: string): string => {
  const separatorIndex = Math.max(relativePath.lastIndexOf("/"), relativePath.lastIndexOf("\\"))
  return separatorIndex >= 0 ? relativePath.slice(0, separatorIndex) : ""
}

export function ComposerMentionMenu({
  entries,
  highlightedIndex,
  id,
  loading,
  onHighlight,
  onSelect,
}: {
  readonly entries: ReadonlyArray<ComposerMentionEntry>
  readonly highlightedIndex: number
  readonly id: string
  readonly loading: boolean
  readonly onHighlight: (index: number) => void
  readonly onSelect: (entry: ComposerMentionEntry) => void
}) {
  const listRef = useRef<HTMLUListElement>(null)
  const [fadeBottom, setFadeBottom] = useState(false)
  const ticketCount = entries.filter((entry) => entry.kind === "ticket").length
  const fileCount = entries.length - ticketCount

  const syncFade = () => {
    const list = listRef.current
    if (list === null) {
      return
    }
    setFadeBottom(composerPathListCanScrollDown(list))
  }

  useLayoutEffect(() => {
    const list = listRef.current
    if (list === null) {
      return
    }
    syncFade()
    const observer = new ResizeObserver(syncFade)
    observer.observe(list)
    return () => {
      observer.disconnect()
    }
  }, [entries, loading])

  return (
    <div className="surface-glass absolute inset-x-6 bottom-full z-20 translate-y-px overflow-hidden rounded-t-xl border border-b-0">
      <ul
        ref={listRef}
        id={id}
        role="listbox"
        aria-label="Mentions"
        className="max-h-56 overflow-y-auto px-1 pt-1 pb-2 text-sm"
        onScroll={syncFade}
      >
        {loading && entries.length === 0 ? (
          <li className="px-2 py-1.5 text-muted-foreground">Recherche…</li>
        ) : null}
        {!loading && entries.length === 0 ? (
          <li className="px-2 py-1.5 text-muted-foreground">No results</li>
        ) : null}
        {entries.map((entry, index) => {
          const selected = index === highlightedIndex
          const showTicketHeading = index === 0 && entry.kind === "ticket"
          const showFileHeading =
            entry.kind === "file" && (index === 0 || entries[index - 1]?.kind === "ticket")
          return (
            <li
              key={entry.kind === "ticket" ? `ticket:${entry.ticketId}` : `file:${entry.path}`}
              role="presentation"
            >
              {showTicketHeading && ticketCount > 0 ? (
                <p className="px-2 pt-1.5 pb-1 text-[11px] font-medium text-muted-foreground">
                  Tickets
                </p>
              ) : null}
              {showFileHeading && fileCount > 0 ? (
                <p className="px-2 pt-1.5 pb-1 text-[11px] font-medium text-muted-foreground">
                  Files
                </p>
              ) : null}
              <button
                type="button"
                id={`composer-path-option-${index}`}
                role="option"
                aria-selected={selected}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left ${
                  selected ? "bg-accent text-accent-foreground" : ""
                }`}
                onMouseEnter={() => {
                  onHighlight(index)
                }}
                onMouseDown={(event) => {
                  event.preventDefault()
                }}
                onClick={() => {
                  onSelect(entry)
                }}
              >
                {entry.kind === "ticket" ? (
                  <>
                    <TicketIcon aria-hidden className="size-4 shrink-0 opacity-85" />
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <span className={`min-w-0 truncate ${entry.done ? "line-through" : ""}`}>
                        {entry.title}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-right text-muted-foreground text-xs">
                        {entry.columnName}
                      </span>
                    </span>
                  </>
                ) : (
                  <>
                    <PierreEntryIcon
                      pathValue={entry.path}
                      kind={entry.entryKind}
                      className="size-4 shrink-0"
                    />
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="shrink-0">{basenameOfPath(entry.path)}</span>
                      <span className="min-w-0 flex-1 truncate text-right text-muted-foreground text-xs">
                        {directoryOfPath(entry.path)}
                      </span>
                    </span>
                  </>
                )}
              </button>
            </li>
          )
        })}
      </ul>
      {fadeBottom ? (
        <div
          aria-hidden
          data-composer-path-fade
          className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-linear-to-t from-background/80 to-transparent"
        />
      ) : null}
    </div>
  )
}
